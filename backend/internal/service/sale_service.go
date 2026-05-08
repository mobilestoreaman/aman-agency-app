package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SaleService defines the business-logic contract for sale management.
type SaleService interface {
	Create(ctx context.Context, staffID, staffName string, req dto.CreateSaleRequest) (*dto.SaleResponse, error)
	GetByID(ctx context.Context, id string) (*dto.SaleResponse, error)
	List(ctx context.Context, f dto.SaleFilter) ([]*dto.SaleResponse, *response.Meta, error)
	// Cancel now accepts staffName so the cancellation ledger entry can record who cancelled.
	Cancel(ctx context.Context, id, staffName string, req dto.CancelSaleRequest) (*dto.SaleResponse, error)
}

type saleService struct {
	saleRepo     repository.SaleRepository
	customerRepo repository.CustomerRepository
	deviceRepo   repository.DeviceRepository
	userRepo     repository.UserRepository
	ledgerRepo   repository.CreditLedgerRepository
	billRepo     repository.BillRepository
	loanRefRepo  repository.LoanReferenceRepository
}

// NewSaleService constructs a SaleService with required repositories.
// ledgerRepo is used to create credit ledger entries whenever a sale has a
// positive balance (credit) or is cancelled.
// billRepo is used to void any bill associated with a cancelled sale.
// loanRefRepo is used to auto-create a LoanReference when payment_mode == "emi".
func NewSaleService(
	saleRepo repository.SaleRepository,
	customerRepo repository.CustomerRepository,
	deviceRepo repository.DeviceRepository,
	userRepo repository.UserRepository,
	ledgerRepo repository.CreditLedgerRepository,
	billRepo repository.BillRepository,
	loanRefRepo repository.LoanReferenceRepository,
) SaleService {
	return &saleService{
		saleRepo:     saleRepo,
		customerRepo: customerRepo,
		deviceRepo:   deviceRepo,
		userRepo:     userRepo,
		ledgerRepo:   ledgerRepo,
		billRepo:     billRepo,
		loanRefRepo:  loanRefRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parseSaleOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid sale id: %s", id))
	}
	return oid, nil
}

func toSaleItemResponse(item models.SaleItem) dto.SaleItemResponse {
	return dto.SaleItemResponse{
		DeviceID:      item.DeviceID.Hex(),
		ProductName:   item.ProductName,
		BrandName:     item.BrandName,
		IMEI1:         item.IMEI1,
		IMEI2:         item.IMEI2,
		SalePrice:     item.SalePrice,
		PurchasePrice: item.PurchasePrice,
	}
}

func toSaleResponse(s *models.Sale) *dto.SaleResponse {
	items := make([]dto.SaleItemResponse, 0, len(s.Items))
	for _, item := range s.Items {
		items = append(items, toSaleItemResponse(item))
	}

	resp := &dto.SaleResponse{
		ID:                 s.ID.Hex(),
		InvoiceNumber:      s.InvoiceNumber,
		CustomerID:         s.CustomerID.Hex(),
		CustomerName:       s.CustomerName,
		CustomerPhone:      s.CustomerPhone,
		StaffID:            s.StaffID.Hex(),
		StaffName:          s.StaffName,
		Items:              items,
		TotalAmount:        s.TotalAmount,
		AmountPaid:         s.AmountPaid,
		Balance:            s.Balance,
		PaymentMode:        string(s.PaymentMode),
		FinanceProvider:    s.FinanceProvider,
		FinanceCompanyName: s.FinanceCompanyName,
		Status:             string(s.Status),
		Notes:              s.Notes,
		SoldAt:             s.SoldAt.Format("2006-01-02T15:04:05Z"),
		CreatedAt:          s.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:          s.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if s.CancelledAt != nil {
		resp.CancelledAt = s.CancelledAt.Format("2006-01-02T15:04:05Z")
	}
	return resp
}

// ── Create ────────────────────────────────────────────────────────────────────

// Create validates all devices are in_stock, flips each to sold, then persists
// the sale document. If the resulting balance is positive (partial payment),
// a credit ledger entry is created and the customer's credit_balance is incremented.
func (s *saleService) Create(ctx context.Context, staffID, staffName string, req dto.CreateSaleRequest) (*dto.SaleResponse, error) {
	// Parse staff ObjectID.
	staffOID, err := primitive.ObjectIDFromHex(staffID)
	if err != nil {
		return nil, apperror.Unauthorized("invalid staff identity in token")
	}

	// Resolve customer.
	customerOID, err := parseObjectID(req.CustomerID, "customer")
	if err != nil {
		return nil, err
	}
	customer, err := s.customerRepo.FindByID(ctx, customerOID)
	if err != nil {
		return nil, apperror.NotFound("customer not found")
	}

	// Cross-field validation: EMI sales require a finance provider.
	if req.PaymentMode == string(models.PaymentModeEMI) {
		if strings.TrimSpace(req.FinanceProvider) == "" {
			return nil, apperror.BadRequest("finance_provider is required when payment_mode is 'emi'")
		}
		if req.FinanceProvider == "other" && strings.TrimSpace(req.FinanceCompanyName) == "" {
			return nil, apperror.BadRequest("finance_company_name is required when finance_provider is 'other'")
		}
	}

	// Parse optional sold_at.
	soldAt := time.Now().UTC()
	if req.SoldAt != "" {
		t, err := time.Parse(time.RFC3339, req.SoldAt)
		if err != nil {
			return nil, apperror.BadRequest("sold_at must be an ISO 8601 date-time string")
		}
		soldAt = t.UTC()
	}

	// Resolve and validate every device line.
	var totalAmount float64
	saleItems := make([]models.SaleItem, 0, len(req.Items))

	for i, reqItem := range req.Items {
		deviceOID, err := parseObjectID(reqItem.DeviceID, "device")
		if err != nil {
			return nil, apperror.BadRequest(fmt.Sprintf("item[%d]: invalid device_id", i))
		}
		device, err := s.deviceRepo.FindByID(ctx, deviceOID)
		if err != nil {
			return nil, apperror.BadRequest(fmt.Sprintf("item[%d]: device not found", i))
		}
		// Accept both "available" and legacy "in_stock" documents.
		if models.NormalizeStatus(device.Status) != models.DeviceStatusAvailable {
			return nil, apperror.Conflict(fmt.Sprintf(
				"item[%d]: device %s (IMEI %s) is %q — only available devices can be sold",
				i, device.ID.Hex(), device.IMEI1, device.Status,
			))
		}

		saleItems = append(saleItems, models.SaleItem{
			DeviceID:      deviceOID,
			ProductName:   device.ProductName,
			BrandName:     device.BrandName,
			IMEI1:         device.IMEI1,
			IMEI2:         device.IMEI2,
			SalePrice:     reqItem.SalePrice,
			PurchasePrice: device.PurchasePrice, // lock COGS at point of sale
		})
		totalAmount += reqItem.SalePrice
	}

	// Atomically flip each device status from available → sold.
	// Using UpdateWithFilter (id + status==available) prevents the double-sell
	// race condition: if two concurrent requests race for the same device, only
	// one will match the filter and the other will get ErrNotFound, triggering
	// a rollback of already-claimed devices.
	for i, item := range saleItems {
		_, err := s.deviceRepo.UpdateWithFilter(
			ctx,
			item.DeviceID,
			bson.M{"status": models.DeviceStatusAvailable}, // only if still available
			bson.M{"status": models.DeviceStatusSold},
		)
		if err != nil {
			// Partial rollback: release already-claimed devices back to available.
			for _, rollback := range saleItems[:i] {
				_, _ = s.deviceRepo.Update(ctx, rollback.DeviceID, bson.M{"status": models.DeviceStatusAvailable})
			}
			// ErrNotFound here means the device was already sold by another request.
			if err == repository.ErrNotFound {
				return nil, apperror.Conflict(fmt.Sprintf(
					"item[%d]: device (IMEI %s) is no longer available — it may have just been sold",
					i, saleItems[i].IMEI1,
				))
			}
			return nil, fmt.Errorf("failed to claim device for item[%d]: %w", i, err)
		}
	}

	amountPaid := req.AmountPaid
	if amountPaid < 0 {
		amountPaid = 0
	}

	// Validate that amount_paid does not exceed total_amount.
	if amountPaid > totalAmount {
		return nil, apperror.BadRequest(
			fmt.Sprintf("amount paid (%.2f) cannot exceed total amount (%.2f)", amountPaid, totalAmount))
	}

	// For EMI sales the balance is the loan amount sent to the finance company.
	// If amount_paid >= total the balance would be ₹0 — a loan with no principal
	// makes no sense. Reject early so the loan reference is never created with ₹0.
	if req.PaymentMode == string(models.PaymentModeEMI) && amountPaid >= totalAmount {
		return nil, apperror.BadRequest(
			"for Finance/EMI sales, amount paid must be less than the total — the remaining balance is the financed loan amount")
	}

	sale := &models.Sale{
		CustomerID:         customerOID,
		CustomerName:       customer.Name,
		CustomerPhone:      customer.Phone,
		StaffID:            staffOID,
		StaffName:          staffName,
		Items:              saleItems,
		TotalAmount:        totalAmount,
		AmountPaid:         amountPaid,
		Balance:            totalAmount - amountPaid,
		PaymentMode:        models.PaymentMode(req.PaymentMode),
		FinanceProvider:    req.FinanceProvider,
		FinanceCompanyName: req.FinanceCompanyName,
		Status:             models.SaleStatusCompleted,
		Notes:              req.Notes,
		SoldAt:             soldAt,
	}

	if err := s.saleRepo.Create(ctx, sale); err != nil {
		// Rollback all device status changes if sale persisting fails.
		for _, item := range saleItems {
			_, _ = s.deviceRepo.Update(ctx, item.DeviceID, bson.M{"status": models.DeviceStatusAvailable})
		}
		return nil, err
	}

	// For EMI sales the outstanding balance is financed by a third-party lender —
	// the finance company pays the store directly (immediately or on processing).
	// Recording the financed balance as customer credit would incorrectly inflate
	// the customer's outstanding debt and the dashboard's "Outstanding Credit" KPI.
	// Only non-EMI sales with a positive balance create a customer credit ledger entry.
	isEMI := sale.PaymentMode == models.PaymentModeEMI
	if sale.Balance > 0 && !isEMI {
		newBalance := customer.CreditBalance + sale.Balance
		entry := &models.CreditLedger{
			CustomerID:   customerOID,
			CustomerName: customer.Name,
			Type:         models.LedgerEntrySale,
			Amount:       sale.Balance,
			BalanceAfter: newBalance,
			Reference:    sale.InvoiceNumber,
			SaleID:       &sale.ID,
			Notes:        fmt.Sprintf("Credit from sale %s", sale.InvoiceNumber),
			CreatedBy:    staffName,
			CreatedAt:    time.Now().UTC(),
		}
		if err := s.ledgerRepo.Create(ctx, entry); err != nil {
			// Rollback: cancel the sale and restore device statuses.
			_ = s.saleRepo.Cancel(ctx, sale.ID, "auto-rollback: ledger creation failed")
			for _, item := range saleItems {
				_, _ = s.deviceRepo.Update(ctx, item.DeviceID, bson.M{"status": models.DeviceStatusAvailable})
			}
			return nil, fmt.Errorf("failed to create ledger entry; sale rolled back: %w", err)
		}
		if err := s.customerRepo.IncrementCredit(ctx, customerOID, sale.Balance); err != nil {
			// Ledger entry was created but credit increment failed — remove the ledger
			// entry and rollback the sale to keep records consistent.
			_ = s.saleRepo.Cancel(ctx, sale.ID, "auto-rollback: credit update failed")
			for _, item := range saleItems {
				_, _ = s.deviceRepo.Update(ctx, item.DeviceID, bson.M{"status": models.DeviceStatusAvailable})
			}
			return nil, fmt.Errorf("failed to update customer credit balance; sale rolled back: %w", err)
		}
	}

	// If payment mode is EMI, auto-create a LoanReference record so the finance
	// partner loan is immediately visible in the Loan References module.
	// LoanAmount = sale.Balance (the financed portion), NOT totalAmount.
	// When a customer pays part in cash and finances the rest, only the outstanding
	// balance (totalAmount - amountPaid) is sent to the finance company.
	// This is non-fatal: a failure here does NOT roll back the sale — the sale
	// is already committed and the operator can create the loan reference manually.
	if isEMI && strings.TrimSpace(sale.FinanceProvider) != "" {
		// Use balance as the financed amount. If staff entered amount_paid = total
		// (unlikely for EMI but valid), loan amount defaults to total to avoid ₹0.
		loanAmount := sale.Balance
		if loanAmount <= 0 {
			loanAmount = totalAmount
		}
		loanRef := &models.LoanReference{
			CustomerID:         customerOID,
			CustomerName:       customer.Name,
			SaleID:             &sale.ID,
			InvoiceNumber:      sale.InvoiceNumber,
			Provider:           sale.FinanceProvider,
			FinanceCompanyName: sale.FinanceCompanyName,
			// LoanAccountNumber defaults to "PENDING" — the finance company issues
			// the actual number after loan approval. Staff can update it later.
			LoanAccountNumber: "PENDING",
			LoanAmount:        loanAmount,
			Status:            models.LoanReferenceStatusActive,
			CreatedBy:         staffName,
		}
		_ = s.loanRefRepo.Create(ctx, loanRef) // non-fatal: ignore error
	}

	return toSaleResponse(sale), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *saleService) GetByID(ctx context.Context, id string) (*dto.SaleResponse, error) {
	oid, err := parseSaleOID(id)
	if err != nil {
		return nil, err
	}
	sale, err := s.saleRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("sale not found")
	}
	return toSaleResponse(sale), nil
}

func (s *saleService) List(ctx context.Context, f dto.SaleFilter) ([]*dto.SaleResponse, *response.Meta, error) {
	sales, total, err := s.saleRepo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}
	meta := pagination.ToMeta(pg, total)

	out := make([]*dto.SaleResponse, 0, len(sales))
	for _, sale := range sales {
		out = append(out, toSaleResponse(sale))
	}
	return out, meta, nil
}

// ── Cancel ────────────────────────────────────────────────────────────────────

// Cancel reverses a completed sale: flips all device statuses back to in_stock,
// marks the sale as cancelled, and reverses any credit balance that was debited
// when the sale was originally created.
func (s *saleService) Cancel(ctx context.Context, id, staffName string, req dto.CancelSaleRequest) (*dto.SaleResponse, error) {
	oid, err := parseSaleOID(id)
	if err != nil {
		return nil, err
	}

	sale, err := s.saleRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("sale not found")
	}
	if sale.Status == models.SaleStatusCancelled {
		return nil, apperror.Conflict("sale is already cancelled")
	}

	// Return all devices to in_stock.
	for _, item := range sale.Items {
		if _, err := s.deviceRepo.Update(ctx, item.DeviceID, bson.M{"status": models.DeviceStatusAvailable}); err != nil {
			return nil, fmt.Errorf("failed to restore device %s: %w", item.DeviceID.Hex(), err)
		}
	}

	if err := s.saleRepo.Cancel(ctx, oid, req.Notes); err != nil {
		return nil, err
	}

	// Void any bill associated with this sale to prevent orphaned billing documents.
	if bill, err := s.billRepo.FindBySaleID(ctx, oid); err == nil && bill != nil {
		billNotes := fmt.Sprintf("Bill voided due to sale cancellation: %s", req.Notes)
		_, _ = s.billRepo.Update(ctx, bill.ID, bson.M{
			"status":    "voided",
			"voided_at": time.Now().UTC(),
			"notes":     billNotes,
		})
	}
	// If no bill exists or bill void fails, continue with sale cancellation.
	// The bill void failure is non-fatal since the sale is already cancelled.

	// Close any loan reference linked to this sale. EMI sales auto-create a
	// LoanReference at creation time; cancelling the sale renders the loan void.
	// Non-fatal: cash/credit sales have no loan reference, so ErrNotFound is ignored.
	if loanRef, err := s.loanRefRepo.FindBySaleID(ctx, oid); err == nil && loanRef != nil {
		loanNotes := fmt.Sprintf("Loan closed: linked sale %s was cancelled. %s", sale.InvoiceNumber, req.Notes)
		_, _ = s.loanRefRepo.Update(ctx, loanRef.ID, bson.M{
			"status": models.LoanReferenceStatusClosed,
			"notes":  loanNotes,
		})
	}

	// Waive any outstanding credit balance the customer still owes for this sale.
	// EMI sales never create a customer credit ledger entry (the finance company
	// covers the balance), so there is nothing to waive on cancellation for EMI.
	// We fetch the customer's *current* credit_balance rather than using sale.Balance
	// because the customer may have made partial payments since the sale was recorded —
	// using the stale sale.Balance would over-correct and push the balance negative.
	if sale.Balance > 0 && sale.PaymentMode != models.PaymentModeEMI {
		customer, cerr := s.customerRepo.FindByID(ctx, sale.CustomerID)
		if cerr != nil {
			// Customer fetch failed — the sale is already cancelled and devices are
			// returned, so we return an error that includes the waiver failure so the
			// caller can surface it. The operator must manually correct the balance.
			return nil, fmt.Errorf(
				"sale %s cancelled and devices returned, but balance waiver failed (customer fetch error): %w — please manually adjust the credit balance",
				sale.InvoiceNumber, cerr,
			)
		}

		if customer.CreditBalance > 0 {
			// Waive only what the customer actually still owes — capped at the original
			// sale balance so we never waive more than this sale's contribution.
			waiveAmount := sale.Balance
			if customer.CreditBalance < waiveAmount {
				waiveAmount = customer.CreditBalance
			}
			newBalance := customer.CreditBalance - waiveAmount

			// Write ledger entry first (safe ordering — same as RecordPayment).
			entry := &models.CreditLedger{
				CustomerID:   sale.CustomerID,
				CustomerName: customer.Name,
				Type:         models.LedgerEntryPayment,
				Amount:       -waiveAmount,
				BalanceAfter: newBalance,
				Reference:    sale.InvoiceNumber,
				SaleID:       &sale.ID,
				Notes:        fmt.Sprintf("Device returned for invoice %s — outstanding balance of ₹%.2f waived", sale.InvoiceNumber, waiveAmount),
				CreatedBy:    staffName,
				CreatedAt:    time.Now().UTC(),
			}
			if lerr := s.ledgerRepo.Create(ctx, entry); lerr != nil {
				return nil, fmt.Errorf(
					"sale %s cancelled, but waiver ledger entry failed: %w — balance not adjusted",
					sale.InvoiceNumber, lerr,
				)
			}
			if ierr := s.customerRepo.IncrementCredit(ctx, sale.CustomerID, -waiveAmount); ierr != nil {
				// Compensate: remove the ledger entry we just wrote.
				_ = s.ledgerRepo.Delete(ctx, entry.ID)
				return nil, fmt.Errorf(
					"sale %s cancelled, but credit balance update failed: %w — ledger entry rolled back",
					sale.InvoiceNumber, ierr,
				)
			}
		}
		// If customer.CreditBalance <= 0 the customer already paid in full — no waiver needed.
	}

	return s.GetByID(ctx, id)
}
