// Package docs contains the embedded Swagger/OpenAPI 2.0 specification for
// the Aman Agency API. This file is committed to source control so that the
// swagger UI can be served without running `swag init` at deploy time.
//
// To regenerate from annotations, run:
//
//	./scripts/gen-docs.sh
package docs

import "github.com/swaggo/swag"

// SwaggerInfo holds the exported fields of the spec's Info object.
var SwaggerInfo = &swag.Spec{
	Version:          "1.0",
	Host:             "",
	BasePath:         "/api/v1",
	Schemes:          []string{},
	Title:            "Aman Agency API",
	Description:      "Inventory and sales management backend for Aman Agency mobile store.",
	InfoInstanceName: "swagger",
	SwaggerTemplate:  docTemplate,
}

const docTemplate = `{
  "swagger": "2.0",
  "info": {
    "title": "Aman Agency API",
    "description": "Inventory and sales management backend for Aman Agency mobile store.",
    "version": "1.0",
    "contact": {}
  },
  "basePath": "/api/v1",
  "consumes": ["application/json"],
  "produces": ["application/json"],
  "securityDefinitions": {
    "BearerAuth": {
      "type": "apiKey",
      "name": "Authorization",
      "in": "header",
      "description": "Enter: Bearer {token}"
    }
  },
  "paths": {
    "/health": {
      "get": {
        "summary": "Health check",
        "description": "Returns application status and MongoDB ping latency.",
        "tags": ["health"],
        "produces": ["application/json"],
        "responses": {
          "200": {"description": "OK"},
          "503": {"description": "MongoDB unreachable"}
        }
      }
    },
    "/auth/login": {
      "post": {
        "summary": "Authenticate user",
        "description": "Validates credentials and returns a JWT access + refresh token pair.",
        "tags": ["auth"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/LoginRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/LoginResponse"}},
          "401": {"description": "Invalid credentials"}
        }
      }
    },
    "/auth/refresh": {
      "post": {
        "summary": "Rotate token pair",
        "description": "Exchanges a valid refresh token for a new access + refresh pair.",
        "tags": ["auth"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/RefreshRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/LoginResponse"}},
          "401": {"description": "Invalid or expired refresh token"}
        }
      }
    },
    "/auth/logout": {
      "post": {
        "summary": "Logout",
        "description": "Stateless logout — client must discard tokens.",
        "tags": ["auth"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK"}
        }
      }
    },
    "/auth/me": {
      "get": {
        "summary": "Get current user",
        "description": "Returns the profile of the authenticated user.",
        "tags": ["auth"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/UserInfo"}},
          "401": {"description": "Unauthorized"}
        }
      }
    },
    "/auth/change-password": {
      "post": {
        "summary": "Change password",
        "tags": ["auth"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/ChangePasswordRequest"}}
        ],
        "responses": {
          "200": {"description": "OK"},
          "400": {"description": "Validation error"}
        }
      }
    },
    "/users": {
      "get": {
        "summary": "List all users",
        "tags": ["users"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/UserInfo"}}}
        }
      },
      "post": {
        "summary": "Create user",
        "tags": ["users"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateUserRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/UserInfo"}},
          "409": {"description": "Email already exists"}
        }
      }
    },
    "/users/{id}": {
      "patch": {
        "summary": "Update user",
        "tags": ["users"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path",  "name": "id",   "required": true, "type": "string"},
          {"in": "body",  "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateUserRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/UserInfo"}},
          "404": {"description": "User not found"}
        }
      }
    },
    "/brands": {
      "get": {
        "summary": "List all brands",
        "tags": ["brands"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/BrandResponse"}}}
        }
      },
      "post": {
        "summary": "Create brand",
        "tags": ["brands"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateBrandRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/BrandResponse"}},
          "409": {"description": "Brand name already exists"}
        }
      }
    },
    "/brands/{id}": {
      "get": {
        "summary": "Get brand by ID",
        "tags": ["brands"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BrandResponse"}},
          "404": {"description": "Brand not found"}
        }
      },
      "put": {
        "summary": "Update brand",
        "tags": ["brands"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateBrandRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BrandResponse"}},
          "404": {"description": "Brand not found"}
        }
      },
      "delete": {
        "summary": "Delete brand",
        "description": "Fails with 409 if any products are linked to this brand.",
        "tags": ["brands"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "409": {"description": "Brand has linked products"}
        }
      }
    },
    "/brands/{id}/products": {
      "get": {
        "summary": "List products for a brand",
        "description": "Paginated list of all products belonging to the specified brand.",
        "tags": ["brands"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path",  "name": "id",     "required": true,  "type": "string"},
          {"in": "query", "name": "page",   "required": false, "type": "integer"},
          {"in": "query", "name": "limit",  "required": false, "type": "integer"},
          {"in": "query", "name": "search", "required": false, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/ProductResponse"}}},
          "404": {"description": "Brand not found"}
        }
      }
    },
    "/products": {
      "get": {
        "summary": "List products",
        "description": "Paginated product catalogue. Supports brand filter and full-text search.",
        "tags": ["products"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "page",     "required": false, "type": "integer"},
          {"in": "query", "name": "limit",    "required": false, "type": "integer"},
          {"in": "query", "name": "brand_id", "required": false, "type": "string"},
          {"in": "query", "name": "search",   "required": false, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/ProductResponse"}}}
        }
      },
      "post": {
        "summary": "Create product",
        "tags": ["products"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateProductRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/ProductResponse"}},
          "409": {"description": "Barcode already exists"}
        }
      }
    },
    "/products/barcode/{barcode}": {
      "get": {
        "summary": "Look up product by barcode",
        "description": "Always returns HTTP 200. Check 'found' field. If found=false, create_suggested=true.",
        "tags": ["products"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "barcode", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "found=true with product data, or found=false with create_suggested=true"}
        }
      }
    },
    "/products/{id}": {
      "get": {
        "summary": "Get product by ID",
        "tags": ["products"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/ProductResponse"}},
          "404": {"description": "Product not found"}
        }
      },
      "put": {
        "summary": "Update product",
        "tags": ["products"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateProductRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/ProductResponse"}},
          "404": {"description": "Product not found"}
        }
      },
      "delete": {
        "summary": "Delete product",
        "description": "Fails with 409 if any devices are linked to this product.",
        "tags": ["products"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "409": {"description": "Product has linked devices"}
        }
      }
    },
    "/devices": {
      "get": {
        "summary": "List devices",
        "description": "Paginated inventory list. Filter by product, status, condition, or search by IMEI/name.",
        "tags": ["devices"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "page",       "required": false, "type": "integer"},
          {"in": "query", "name": "limit",      "required": false, "type": "integer"},
          {"in": "query", "name": "product_id", "required": false, "type": "string"},
          {"in": "query", "name": "status",     "required": false, "type": "string",  "description": "in_stock|sold|repair|returned|defective"},
          {"in": "query", "name": "condition",  "required": false, "type": "string",  "description": "new|used|refurbished"},
          {"in": "query", "name": "search",     "required": false, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/DeviceResponse"}}}
        }
      },
      "post": {
        "summary": "Add device to inventory",
        "description": "Creates a new device unit. IMEI1 must be globally unique. Status defaults to in_stock.",
        "tags": ["devices"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateDeviceRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/DeviceResponse"}},
          "409": {"description": "IMEI already exists"}
        }
      }
    },
    "/devices/imei/{imei}": {
      "get": {
        "summary": "Look up device by IMEI",
        "description": "Matches against IMEI1 and IMEI2. Returns 404 if not found.",
        "tags": ["devices"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "imei", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/DeviceResponse"}},
          "404": {"description": "Device not found"}
        }
      }
    },
    "/devices/{id}": {
      "get": {
        "summary": "Get device by ID",
        "tags": ["devices"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/DeviceResponse"}},
          "404": {"description": "Device not found"}
        }
      },
      "put": {
        "summary": "Update device fields",
        "description": "Updates mutable fields. Status changes must use PATCH /devices/:id/status.",
        "tags": ["devices"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateDeviceRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/DeviceResponse"}},
          "404": {"description": "Device not found"}
        }
      },
      "delete": {
        "summary": "Delete device",
        "description": "Prevents deletion of devices in 'sold' or 'repair' status.",
        "tags": ["devices"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "409": {"description": "Device is sold or in repair"}
        }
      }
    },
    "/devices/{id}/status": {
      "patch": {
        "summary": "Change device status",
        "description": "Enforces state machine. Transitions: in_stock→sold|repair|defective, sold→returned, repair→in_stock|defective, returned→in_stock|defective, defective→repair.",
        "tags": ["devices"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/ChangeStatusRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/DeviceResponse"}},
          "422": {"description": "Invalid status transition"}
        }
      }
    },
    "/stock/summary": {
      "get": {
        "summary": "Stock summary",
        "description": "Returns device counts per product grouped by status, plus global totals.",
        "tags": ["stock"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/StockSummaryResponse"}}
        }
      }
    },
    "/vendors": {
      "get": {
        "summary": "List vendors",
        "description": "Returns all vendors sorted alphabetically by name.",
        "tags": ["vendors"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/VendorResponse"}}}
        }
      },
      "post": {
        "summary": "Create vendor",
        "tags": ["vendors"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateVendorRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/VendorResponse"}},
          "409": {"description": "Phone already registered"}
        }
      }
    },
    "/vendors/{id}": {
      "get": {
        "summary": "Get vendor by ID",
        "tags": ["vendors"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/VendorResponse"}},
          "404": {"description": "Vendor not found"}
        }
      },
      "put": {
        "summary": "Update vendor",
        "tags": ["vendors"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateVendorRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/VendorResponse"}},
          "404": {"description": "Vendor not found"}
        }
      },
      "delete": {
        "summary": "Delete vendor",
        "tags": ["vendors"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "404": {"description": "Vendor not found"}
        }
      }
    },
    "/purchases": {
      "get": {
        "summary": "List purchases",
        "description": "Paginated list of purchase orders, most recent first.",
        "tags": ["purchases"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "page",      "required": false, "type": "integer"},
          {"in": "query", "name": "limit",     "required": false, "type": "integer"},
          {"in": "query", "name": "vendor_id", "required": false, "type": "string"},
          {"in": "query", "name": "status",    "required": false, "type": "string", "description": "pending|received|cancelled"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/PurchaseResponse"}}}
        }
      },
      "post": {
        "summary": "Create purchase order",
        "description": "Creates a pending purchase. Devices are NOT added to inventory until /receive is called.",
        "tags": ["purchases"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreatePurchaseRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/PurchaseResponse"}},
          "400": {"description": "Validation error"}
        }
      }
    },
    "/purchases/{id}": {
      "get": {
        "summary": "Get purchase by ID",
        "tags": ["purchases"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/PurchaseResponse"}},
          "404": {"description": "Purchase not found"}
        }
      },
      "delete": {
        "summary": "Delete purchase order",
        "description": "Only pending or cancelled purchases can be deleted.",
        "tags": ["purchases"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "409": {"description": "Purchase already received"}
        }
      }
    },
    "/purchases/{id}/receive": {
      "patch": {
        "summary": "Receive purchase",
        "description": "Marks purchase as received and creates a Device for each line item (status=in_stock). Fails with 409 on IMEI conflict.",
        "tags": ["purchases"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": false, "schema": {"$ref": "#/definitions/ReceivePurchaseRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/PurchaseResponse"}},
          "409": {"description": "IMEI conflict or purchase not pending"}
        }
      }
    },
    "/customers": {
      "get": {
        "summary": "List customers",
        "description": "Paginated customer list. Supports search by name or phone.",
        "tags": ["customers"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "page",   "type": "integer", "description": "Page (default 1)"},
          {"in": "query", "name": "limit",  "type": "integer", "description": "Per page (default 20, max 100)"},
          {"in": "query", "name": "search", "type": "string",  "description": "Search by name or phone"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/CustomerResponse"}}}
        }
      },
      "post": {
        "summary": "Create customer",
        "tags": ["customers"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateCustomerRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/CustomerResponse"}},
          "409": {"description": "Phone already registered"}
        }
      }
    },
    "/customers/{id}": {
      "get": {
        "summary": "Get customer by ID",
        "tags": ["customers"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/CustomerResponse"}},
          "404": {"description": "Customer not found"}
        }
      },
      "put": {
        "summary": "Update customer",
        "tags": ["customers"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true,  "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateCustomerRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/CustomerResponse"}},
          "404": {"description": "Customer not found"}
        }
      },
      "delete": {
        "summary": "Delete customer",
        "description": "Admin only.",
        "tags": ["customers"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "404": {"description": "Customer not found"}
        }
      }
    },
    "/sales": {
      "get": {
        "summary": "List sales",
        "description": "Paginated list of sale invoices, most recent first.",
        "tags": ["sales"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "page",        "type": "integer", "description": "Page (default 1)"},
          {"in": "query", "name": "limit",       "type": "integer", "description": "Per page (default 20, max 100)"},
          {"in": "query", "name": "customer_id", "type": "string",  "description": "Filter by customer ObjectID"},
          {"in": "query", "name": "staff_id",    "type": "string",  "description": "Filter by staff ObjectID"},
          {"in": "query", "name": "status",      "type": "string",  "description": "Filter by status (completed|cancelled)"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/SaleResponse"}}}
        }
      },
      "post": {
        "summary": "Create sale invoice",
        "description": "Validates all devices are in_stock, flips their status to sold, and creates the invoice. Balance = TotalAmount - AmountPaid.",
        "tags": ["sales"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateSaleRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/SaleResponse"}},
          "400": {"description": "Validation error"},
          "409": {"description": "Device not in_stock"}
        }
      }
    },
    "/sales/{id}": {
      "get": {
        "summary": "Get sale by ID",
        "description": "Returns the full sale invoice including all line items.",
        "tags": ["sales"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/SaleResponse"}},
          "404": {"description": "Sale not found"}
        }
      }
    },
    "/sales/{id}/cancel": {
      "patch": {
        "summary": "Cancel sale",
        "description": "Admin only. Reverses the sale: all device statuses are restored to in_stock. Already-cancelled sales return 409.",
        "tags": ["sales"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true,  "type": "string"},
          {"in": "body", "name": "body", "required": false, "schema": {"$ref": "#/definitions/CancelSaleRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/SaleResponse"}},
          "409": {"description": "Already cancelled"}
        }
      }
    },
    "/customers/{id}/ledger": {
      "get": {
        "summary": "List credit ledger for customer",
        "description": "Paginated credit/debit history for a customer, newest first. Filter by type: sale | payment | adjustment | cancellation.",
        "tags": ["customers"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path",  "name": "id",    "required": true, "type": "string"},
          {"in": "query", "name": "page",  "type": "integer", "description": "Page (default 1)"},
          {"in": "query", "name": "limit", "type": "integer", "description": "Per page (default 20, max 100)"},
          {"in": "query", "name": "type",  "type": "string",  "description": "Filter: sale|payment|adjustment|cancellation"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/CreditLedgerResponse"}}},
          "404": {"description": "Customer not found"}
        }
      }
    },
    "/customers/{id}/payments": {
      "post": {
        "summary": "Record customer payment",
        "description": "Records a cash payment received from a customer, reducing their credit balance. Amount must be positive.",
        "tags": ["customers"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/RecordPaymentRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/CreditLedgerResponse"}},
          "400": {"description": "Validation error"},
          "404": {"description": "Customer not found"}
        }
      }
    },
    "/customers/{id}/adjustments": {
      "post": {
        "summary": "Manual balance adjustment",
        "description": "Admin only. Applies a manual debit (positive amount) or credit (negative amount) to the customer's balance. Notes are required.",
        "tags": ["customers"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/RecordAdjustmentRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/CreditLedgerResponse"}},
          "400": {"description": "Validation error"},
          "404": {"description": "Customer not found"}
        }
      }
    },
    "/loan-references": {
      "get": {
        "summary": "List loan references",
        "description": "Paginated list of guarantor references. Filter by customer_id, sale_id, or status.",
        "tags": ["loan-references"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "customer_id", "type": "string",  "description": "Filter by customer ObjectID"},
          {"in": "query", "name": "sale_id",     "type": "string",  "description": "Filter by sale ObjectID"},
          {"in": "query", "name": "status",      "type": "string",  "description": "Filter: active|settled|defaulted"},
          {"in": "query", "name": "page",        "type": "integer", "description": "Page (default 1)"},
          {"in": "query", "name": "limit",       "type": "integer", "description": "Per page (default 20, max 100)"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/LoanReferenceResponse"}}}
        }
      },
      "post": {
        "summary": "Create loan reference",
        "description": "Attaches a guarantor reference to an existing credit sale. The sale must not be cancelled.",
        "tags": ["loan-references"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateLoanReferenceRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/LoanReferenceResponse"}},
          "400": {"description": "Validation error"},
          "404": {"description": "Sale not found"},
          "409": {"description": "Sale is cancelled"}
        }
      }
    },
    "/loan-references/{id}": {
      "get": {
        "summary": "Get loan reference by ID",
        "tags": ["loan-references"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/LoanReferenceResponse"}},
          "404": {"description": "Not found"}
        }
      },
      "put": {
        "summary": "Update loan reference",
        "description": "Patches the reference person's contact details. All fields are optional.",
        "tags": ["loan-references"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateLoanReferenceRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/LoanReferenceResponse"}},
          "404": {"description": "Not found"}
        }
      },
      "delete": {
        "summary": "Delete loan reference",
        "description": "Admin only. Permanently removes the guarantor reference record.",
        "tags": ["loan-references"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/loan-references/{id}/status": {
      "patch": {
        "summary": "Change loan reference status",
        "description": "Admin only. Transitions the reference: active → settled | defaulted.",
        "tags": ["loan-references"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/ChangeLoanReferenceStatusRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/LoanReferenceResponse"}},
          "400": {"description": "Invalid status value"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/borrow-lends": {
      "get": {
        "summary": "List borrow/lend records",
        "description": "Paginated list of borrow and lend transactions. Filter by type, status, or customer_id.",
        "tags": ["borrow-lends"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "type",        "type": "string",  "description": "borrow|lend"},
          {"in": "query", "name": "status",      "type": "string",  "description": "active|returned|overdue"},
          {"in": "query", "name": "customer_id", "type": "string",  "description": "Filter by linked customer ObjectID"},
          {"in": "query", "name": "page",        "type": "integer", "description": "Page (default 1)"},
          {"in": "query", "name": "limit",       "type": "integer", "description": "Per page (default 20, max 100)"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"type": "array", "items": {"$ref": "#/definitions/BorrowLendResponse"}}}
        }
      },
      "post": {
        "summary": "Create borrow/lend record",
        "description": "Opens a new borrow or lend transaction. DeviceID and CustomerID are optional links. Device status is NOT modified.",
        "tags": ["borrow-lends"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateBorrowLendRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/BorrowLendResponse"}},
          "400": {"description": "Validation error"},
          "404": {"description": "Device or customer not found"}
        }
      }
    },
    "/borrow-lends/{id}": {
      "get": {
        "summary": "Get borrow/lend record by ID",
        "tags": ["borrow-lends"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BorrowLendResponse"}},
          "404": {"description": "Not found"}
        }
      },
      "put": {
        "summary": "Update borrow/lend record",
        "description": "Patches mutable contact and description fields. All fields are optional.",
        "tags": ["borrow-lends"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateBorrowLendRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BorrowLendResponse"}},
          "404": {"description": "Not found"}
        }
      },
      "delete": {
        "summary": "Delete borrow/lend record",
        "description": "Admin only. Permanently removes the record.",
        "tags": ["borrow-lends"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "204": {"description": "No Content"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/borrow-lends/{id}/return": {
      "patch": {
        "summary": "Mark device as returned",
        "description": "Stamps returned_at and sets status=returned. Already-returned records return 409.",
        "tags": ["borrow-lends"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id",   "required": true,  "type": "string"},
          {"in": "body", "name": "body", "required": false, "schema": {"$ref": "#/definitions/ReturnBorrowLendRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BorrowLendResponse"}},
          "404": {"description": "Not found"},
          "409": {"description": "Already returned"}
        }
      }
    },
    "/borrow-lends/{id}/overdue": {
      "patch": {
        "summary": "Mark transaction as overdue",
        "description": "Admin only. Sets status=overdue. Returned transactions return 409.",
        "tags": ["borrow-lends"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BorrowLendResponse"}},
          "404": {"description": "Not found"},
          "409": {"description": "Already returned or overdue"}
        }
      }
    },
    "/bills": {
      "get": {
        "summary": "List bills",
        "description": "Returns a paginated list of billing documents with optional filters.",
        "tags": ["bills"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "customer_id", "type": "string", "description": "Filter by customer ID"},
          {"in": "query", "name": "sale_id",     "type": "string", "description": "Filter by sale ID"},
          {"in": "query", "name": "status",      "type": "string", "description": "draft|issued|voided"},
          {"in": "query", "name": "page",        "type": "integer"},
          {"in": "query", "name": "limit",       "type": "integer"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "401": {"description": "Unauthorised"}
        }
      },
      "post": {
        "summary": "Create a bill",
        "description": "Generates a formal billing document from an existing completed sale. One bill per sale.",
        "tags": ["bills"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateBillRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/BillResponse"}},
          "400": {"description": "Invalid input"},
          "404": {"description": "Sale not found"},
          "409": {"description": "Bill already exists for this sale"}
        }
      }
    },
    "/bills/sale/{sale_id}": {
      "get": {
        "summary": "Get bill by sale ID",
        "description": "Returns the billing document associated with a specific sale.",
        "tags": ["bills"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "sale_id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BillResponse"}},
          "404": {"description": "No bill for this sale"}
        }
      }
    },
    "/bills/{id}": {
      "get": {
        "summary": "Get bill by ID",
        "description": "Returns a single billing document.",
        "tags": ["bills"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BillResponse"}},
          "404": {"description": "Not found"}
        }
      }
    },
    "/bills/{id}/issue": {
      "patch": {
        "summary": "Issue a bill",
        "description": "Transitions a draft bill to issued, stamping issued_at. Non-draft bills return 409.",
        "tags": ["bills"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BillResponse"}},
          "404": {"description": "Not found"},
          "409": {"description": "Already issued or voided"}
        }
      }
    },
    "/bills/{id}/void": {
      "patch": {
        "summary": "Void a bill",
        "description": "Admin only. Cancels a draft or issued bill. Already-voided bills return 409.",
        "tags": ["bills"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/BillResponse"}},
          "404": {"description": "Not found"},
          "409": {"description": "Already voided"}
        }
      }
    },
    "/reports/revenue": {
      "get": {
        "summary": "Revenue summary",
        "description": "Admin only. Aggregates completed sales in a date range: count, revenue, collected, outstanding, avg value and cancelled count. Dates in IST (Asia/Kolkata).",
        "tags": ["reports"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "from", "type": "string", "description": "Start date DD-MM-YYYY IST (default: 30 days ago)"},
          {"in": "query", "name": "to",   "type": "string", "description": "End date DD-MM-YYYY IST (default: today)"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/RevenueSummaryResponse"}},
          "400": {"description": "Invalid date format"},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/reports/stock-valuation": {
      "get": {
        "summary": "Stock valuation",
        "description": "Admin only. Returns unit counts and purchase/sale value across all device statuses.",
        "tags": ["reports"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/StockValuationResponse"}},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/reports/credit-summary": {
      "get": {
        "summary": "Credit balance summary",
        "description": "Admin only. Returns total outstanding credit and top 10 debtors.",
        "tags": ["reports"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/CreditSummaryResponse"}},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/dashboard": {
      "get": {
        "summary": "Dashboard summary",
        "description": "Returns the PWA home-screen payload: today's sales, stock counts, outstanding credit, borrow-lend status, notification badge, month expenses, last 5 sales and low-stock alerts. All sub-queries run concurrently; non-critical failures zero-out gracefully.",
        "tags": ["dashboard"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/DashboardResponse"}},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/search": {
      "get": {
        "summary": "Global search",
        "description": "Queries customers (name/phone), products (model/barcode), devices (IMEI/name), and sales (invoice/customer) concurrently. Results are bucketed by type. Use the 'types' param to restrict scope.",
        "tags": ["search"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "q",     "required": true,  "type": "string",  "description": "Search query — minimum 2 characters"},
          {"in": "query", "name": "types", "required": false, "type": "string",  "description": "Comma-separated: customers,products,devices,sales (default: all)"},
          {"in": "query", "name": "limit", "required": false, "type": "integer", "description": "Max results per bucket (default 5, max 20)"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/SearchResponse"}},
          "400": {"description": "Query too short"},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/expenses": {
      "get": {
        "summary": "List expenses",
        "description": "Paginated list of operational expense records with optional category and date-range filters.",
        "tags": ["expenses"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "category", "type": "string", "description": "rent | salary | utilities | maintenance | marketing | miscellaneous"},
          {"in": "query", "name": "from",     "type": "string", "description": "Start date DD-MM-YYYY IST"},
          {"in": "query", "name": "to",       "type": "string", "description": "End date DD-MM-YYYY IST"},
          {"in": "query", "name": "page",     "type": "integer"},
          {"in": "query", "name": "limit",    "type": "integer"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "401": {"description": "Unauthorised"}
        }
      },
      "post": {
        "summary": "Create an expense (admin)",
        "description": "Admin only. Records a new operational cost entry.",
        "tags": ["expenses"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateExpenseRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/ExpenseResponse"}},
          "400": {"description": "Invalid input"}
        }
      }
    },
    "/expenses/summary": {
      "get": {
        "summary": "Expense summary report",
        "description": "Returns total amount and per-category breakdown for a date range. Date filter defaults to last 30 days.",
        "tags": ["expenses"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "from", "type": "string", "description": "Start date DD-MM-YYYY IST"},
          {"in": "query", "name": "to",   "type": "string", "description": "End date DD-MM-YYYY IST"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/ExpenseSummaryResponse"}},
          "400": {"description": "Invalid date format"}
        }
      }
    },
    "/expenses/{id}": {
      "get": {
        "summary": "Get expense by ID",
        "description": "Returns a single expense document.",
        "tags": ["expenses"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/ExpenseResponse"}},
          "404": {"description": "Not found"}
        }
      },
      "put": {
        "summary": "Update an expense (admin)",
        "description": "Admin only. Partial update — only non-empty/non-zero fields are written.",
        "tags": ["expenses"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"},
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateExpenseRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/ExpenseResponse"}},
          "400": {"description": "Invalid input"},
          "404": {"description": "Not found"}
        }
      },
      "delete": {
        "summary": "Delete an expense (admin)",
        "description": "Admin only. Hard-deletes an expense document.",
        "tags": ["expenses"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/settings": {
      "get": {
        "summary": "Get store settings",
        "description": "Returns the singleton store configuration. Initialises default values on first boot.",
        "tags": ["settings"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/SettingsResponse"}},
          "401": {"description": "Unauthorised"}
        }
      },
      "put": {
        "summary": "Update store settings (admin)",
        "description": "Admin only. Partial update — only supplied string fields and all numeric fields are written.",
        "tags": ["settings"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/UpdateSettingsRequest"}}
        ],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/SettingsResponse"}},
          "400": {"description": "Invalid input"},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/notifications": {
      "get": {
        "summary": "List notifications",
        "description": "Returns paginated notifications. Admins see all; staff see broadcast + own.",
        "tags": ["notifications"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "status", "type": "string", "description": "unread | read | dismissed"},
          {"in": "query", "name": "type",   "type": "string", "description": "low_stock | overdue | credit_due | sale_cancel | general"},
          {"in": "query", "name": "page",   "type": "integer"},
          {"in": "query", "name": "limit",  "type": "integer"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "401": {"description": "Unauthorised"}
        }
      },
      "post": {
        "summary": "Create notification (admin)",
        "description": "Admin only. Manually posts a broadcast or targeted notification.",
        "tags": ["notifications"],
        "consumes": ["application/json"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "body", "name": "body", "required": true, "schema": {"$ref": "#/definitions/CreateNotificationRequest"}}
        ],
        "responses": {
          "201": {"description": "Created", "schema": {"$ref": "#/definitions/NotificationResponse"}},
          "400": {"description": "Invalid input"}
        }
      }
    },
    "/notifications/unread-count": {
      "get": {
        "summary": "Unread notification count",
        "description": "Returns the badge count of unread notifications visible to the caller.",
        "tags": ["notifications"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK", "schema": {"$ref": "#/definitions/UnreadCountResponse"}},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/notifications/read-all": {
      "patch": {
        "summary": "Mark all notifications as read",
        "description": "Marks every unread notification visible to the caller as read.",
        "tags": ["notifications"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "responses": {
          "200": {"description": "OK"},
          "401": {"description": "Unauthorised"}
        }
      }
    },
    "/notifications/{id}/read": {
      "patch": {
        "summary": "Mark notification as read",
        "description": "Sets status=read and stamps read_at on a single notification.",
        "tags": ["notifications"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/notifications/{id}/dismiss": {
      "patch": {
        "summary": "Dismiss a notification",
        "description": "Sets status=dismissed (hides from default unread views).",
        "tags": ["notifications"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/notifications/{id}": {
      "delete": {
        "summary": "Delete notification (admin)",
        "description": "Admin only. Hard-deletes a notification document.",
        "tags": ["notifications"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "path", "name": "id", "required": true, "type": "string"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "404": {"description": "Not found"}
        }
      }
    },
    "/reports/sales-by-period": {
      "get": {
        "summary": "Sales breakdown by period",
        "description": "Admin only. Groups non-cancelled sales into daily, weekly, or monthly buckets. Dates in IST (Asia/Kolkata).",
        "tags": ["reports"],
        "produces": ["application/json"],
        "security": [{"BearerAuth": []}],
        "parameters": [
          {"in": "query", "name": "from",     "type": "string", "description": "Start date DD-MM-YYYY IST"},
          {"in": "query", "name": "to",       "type": "string", "description": "End date DD-MM-YYYY IST"},
          {"in": "query", "name": "group_by", "type": "string", "description": "daily | weekly | monthly (default: daily)"}
        ],
        "responses": {
          "200": {"description": "OK"},
          "400": {"description": "Invalid params"},
          "401": {"description": "Unauthorised"}
        }
      }
    }
  },
  "definitions": {
    "LoginRequest": {
      "type": "object",
      "required": ["email", "password"],
      "properties": {
        "email":    {"type": "string", "example": "admin@amanagency.pk"},
        "password": {"type": "string", "example": "SecretPass1!"}
      }
    },
    "RefreshRequest": {
      "type": "object",
      "required": ["refresh_token"],
      "properties": {
        "refresh_token": {"type": "string"}
      }
    },
    "LoginResponse": {
      "type": "object",
      "properties": {
        "access_token":  {"type": "string"},
        "refresh_token": {"type": "string"},
        "expires_in":    {"type": "integer"}
      }
    },
    "ChangePasswordRequest": {
      "type": "object",
      "required": ["old_password", "new_password"],
      "properties": {
        "old_password": {"type": "string"},
        "new_password": {"type": "string"}
      }
    },
    "UserInfo": {
      "type": "object",
      "properties": {
        "id":         {"type": "string"},
        "name":       {"type": "string"},
        "email":      {"type": "string"},
        "role":       {"type": "string", "enum": ["admin", "staff"]},
        "created_at": {"type": "string", "format": "date-time"}
      }
    },
    "CreateUserRequest": {
      "type": "object",
      "required": ["name", "email", "password", "role"],
      "properties": {
        "name":     {"type": "string"},
        "email":    {"type": "string"},
        "password": {"type": "string"},
        "role":     {"type": "string", "enum": ["admin", "staff"]}
      }
    },
    "UpdateUserRequest": {
      "type": "object",
      "properties": {
        "name":     {"type": "string"},
        "role":     {"type": "string", "enum": ["admin", "staff"]},
        "password": {"type": "string"}
      }
    },
    "BrandResponse": {
      "type": "object",
      "properties": {
        "id":         {"type": "string"},
        "name":       {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "updated_at": {"type": "string", "format": "date-time"}
      }
    },
    "CreateBrandRequest": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": {"type": "string", "example": "Samsung"}
      }
    },
    "UpdateBrandRequest": {
      "type": "object",
      "properties": {
        "name": {"type": "string"}
      }
    },
    "VariantRequest": {
      "type": "object",
      "properties": {
        "ram":     {"type": "string", "example": "8GB"},
        "storage": {"type": "string", "example": "256GB"}
      }
    },
    "AccessoriesRequest": {
      "type": "object",
      "properties": {
        "has_charger":   {"type": "boolean"},
        "has_earphones": {"type": "boolean"},
        "has_cable":     {"type": "boolean"},
        "has_box":       {"type": "boolean"}
      }
    },
    "CreateProductRequest": {
      "type": "object",
      "required": ["brand_id", "model_name", "barcode"],
      "properties": {
        "brand_id":     {"type": "string"},
        "model_name":   {"type": "string", "example": "Galaxy S24"},
        "variant":      {"$ref": "#/definitions/VariantRequest"},
        "color":        {"type": "string"},
        "screen_size":  {"type": "string"},
        "barcode":      {"type": "string"},
        "barcode_type": {"type": "string", "enum": ["EAN-13", "UPC-A", "CODE-128", "CODE-39", "QR", "AUTO"]},
        "accessories":  {"$ref": "#/definitions/AccessoriesRequest"}
      }
    },
    "UpdateProductRequest": {
      "type": "object",
      "properties": {
        "brand_id":     {"type": "string"},
        "model_name":   {"type": "string"},
        "variant":      {"$ref": "#/definitions/VariantRequest"},
        "color":        {"type": "string"},
        "screen_size":  {"type": "string"},
        "barcode":      {"type": "string"},
        "barcode_type": {"type": "string", "enum": ["EAN-13", "UPC-A", "CODE-128", "CODE-39", "QR", "AUTO"]},
        "accessories":  {"$ref": "#/definitions/AccessoriesRequest"}
      }
    },
    "ProductResponse": {
      "type": "object",
      "properties": {
        "id":           {"type": "string"},
        "brand_id":     {"type": "string"},
        "brand_name":   {"type": "string"},
        "model_name":   {"type": "string"},
        "display_name": {"type": "string"},
        "variant":      {"$ref": "#/definitions/VariantRequest"},
        "color":        {"type": "string"},
        "screen_size":  {"type": "string"},
        "barcode":      {"type": "string"},
        "barcode_type": {"type": "string"},
        "accessories":  {"$ref": "#/definitions/AccessoriesRequest"},
        "created_at":   {"type": "string", "format": "date-time"},
        "updated_at":   {"type": "string", "format": "date-time"}
      }
    },
    "CreateDeviceRequest": {
      "type": "object",
      "required": ["product_id", "imei1", "condition", "purchase_price"],
      "properties": {
        "product_id":     {"type": "string"},
        "imei1":          {"type": "string", "example": "352099001761481"},
        "imei2":          {"type": "string", "description": "Optional — dual-SIM only"},
        "condition":      {"type": "string", "enum": ["new", "used", "refurbished"]},
        "color":          {"type": "string"},
        "purchase_price": {"type": "number", "description": "Cost price in PKR"},
        "notes":          {"type": "string"}
      }
    },
    "UpdateDeviceRequest": {
      "type": "object",
      "properties": {
        "product_id":     {"type": "string"},
        "imei1":          {"type": "string"},
        "imei2":          {"type": "string"},
        "condition":      {"type": "string", "enum": ["new", "used", "refurbished"]},
        "color":          {"type": "string"},
        "purchase_price": {"type": "number"},
        "notes":          {"type": "string"}
      }
    },
    "ChangeStatusRequest": {
      "type": "object",
      "required": ["status"],
      "properties": {
        "status": {"type": "string", "enum": ["in_stock", "sold", "repair", "returned", "defective"]},
        "notes":  {"type": "string"}
      }
    },
    "DeviceResponse": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "product_id":     {"type": "string"},
        "product_name":   {"type": "string"},
        "brand_name":     {"type": "string"},
        "imei1":          {"type": "string"},
        "imei2":          {"type": "string"},
        "status":         {"type": "string"},
        "condition":      {"type": "string"},
        "color":          {"type": "string"},
        "purchase_price": {"type": "number"},
        "notes":          {"type": "string"},
        "created_at":     {"type": "string", "format": "date-time"},
        "updated_at":     {"type": "string", "format": "date-time"}
      }
    },
    "ProductStockRow": {
      "type": "object",
      "properties": {
        "product_id":   {"type": "string"},
        "product_name": {"type": "string"},
        "brand_name":   {"type": "string"},
        "in_stock":     {"type": "integer"},
        "sold":         {"type": "integer"},
        "repair":       {"type": "integer"},
        "returned":     {"type": "integer"},
        "defective":    {"type": "integer"},
        "total":        {"type": "integer"}
      }
    },
    "StockSummaryResponse": {
      "type": "object",
      "properties": {
        "rows":           {"type": "array", "items": {"$ref": "#/definitions/ProductStockRow"}},
        "total_in_stock": {"type": "integer"},
        "total_units":    {"type": "integer"}
      }
    },
    "VendorResponse": {
      "type": "object",
      "properties": {
        "id":         {"type": "string"},
        "name":       {"type": "string"},
        "phone":      {"type": "string"},
        "address":    {"type": "string"},
        "notes":      {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "updated_at": {"type": "string", "format": "date-time"}
      }
    },
    "CreateVendorRequest": {
      "type": "object",
      "required": ["name", "phone"],
      "properties": {
        "name":    {"type": "string", "example": "Ali Mobile Traders"},
        "phone":   {"type": "string", "example": "+923001234567"},
        "address": {"type": "string"},
        "notes":   {"type": "string"}
      }
    },
    "UpdateVendorRequest": {
      "type": "object",
      "properties": {
        "name":    {"type": "string"},
        "phone":   {"type": "string"},
        "address": {"type": "string"},
        "notes":   {"type": "string"}
      }
    },
    "PurchaseItemRequest": {
      "type": "object",
      "required": ["product_id", "imei1", "condition", "purchase_price"],
      "properties": {
        "product_id":     {"type": "string"},
        "imei1":          {"type": "string", "example": "352099001761481"},
        "imei2":          {"type": "string"},
        "condition":      {"type": "string", "enum": ["new", "used", "refurbished"]},
        "color":          {"type": "string"},
        "purchase_price": {"type": "number"}
      }
    },
    "CreatePurchaseRequest": {
      "type": "object",
      "required": ["vendor_id", "items"],
      "properties": {
        "vendor_id":    {"type": "string"},
        "items":        {"type": "array", "items": {"$ref": "#/definitions/PurchaseItemRequest"}, "minItems": 1},
        "notes":        {"type": "string"},
        "purchased_at": {"type": "string", "format": "date-time", "description": "Defaults to now"}
      }
    },
    "ReceivePurchaseRequest": {
      "type": "object",
      "properties": {
        "notes": {"type": "string"}
      }
    },
    "PurchaseItemResponse": {
      "type": "object",
      "properties": {
        "product_id":     {"type": "string"},
        "product_name":   {"type": "string"},
        "brand_name":     {"type": "string"},
        "imei1":          {"type": "string"},
        "imei2":          {"type": "string"},
        "condition":      {"type": "string"},
        "color":          {"type": "string"},
        "purchase_price": {"type": "number"},
        "device_id":      {"type": "string", "description": "Populated after receive"}
      }
    },
    "PurchaseResponse": {
      "type": "object",
      "properties": {
        "id":           {"type": "string"},
        "vendor_id":    {"type": "string"},
        "vendor_name":  {"type": "string"},
        "items":        {"type": "array", "items": {"$ref": "#/definitions/PurchaseItemResponse"}},
        "status":       {"type": "string", "enum": ["pending", "received", "cancelled"]},
        "total_cost":   {"type": "number"},
        "notes":        {"type": "string"},
        "purchased_at": {"type": "string", "format": "date-time"},
        "received_at":  {"type": "string", "format": "date-time"},
        "created_at":   {"type": "string", "format": "date-time"},
        "updated_at":   {"type": "string", "format": "date-time"}
      }
    },
    "CreateCustomerRequest": {
      "type": "object",
      "required": ["name", "phone"],
      "properties": {
        "name":    {"type": "string", "example": "Ali Hassan"},
        "phone":   {"type": "string", "example": "+923001234567"},
        "address": {"type": "string"},
        "notes":   {"type": "string"}
      }
    },
    "UpdateCustomerRequest": {
      "type": "object",
      "properties": {
        "name":    {"type": "string"},
        "phone":   {"type": "string"},
        "address": {"type": "string"},
        "notes":   {"type": "string"}
      }
    },
    "CustomerResponse": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "name":           {"type": "string"},
        "phone":          {"type": "string"},
        "address":        {"type": "string"},
        "credit_balance": {"type": "number", "description": "Outstanding balance in PKR (positive = customer owes)"},
        "notes":          {"type": "string"},
        "created_at":     {"type": "string", "format": "date-time"},
        "updated_at":     {"type": "string", "format": "date-time"}
      }
    },
    "SaleItemRequest": {
      "type": "object",
      "required": ["device_id", "sale_price"],
      "properties": {
        "device_id":  {"type": "string", "description": "Device ObjectID — must be in_stock"},
        "sale_price": {"type": "number", "description": "Agreed sale price in PKR"}
      }
    },
    "CreateSaleRequest": {
      "type": "object",
      "required": ["customer_id", "items"],
      "properties": {
        "customer_id":  {"type": "string"},
        "items":        {"type": "array", "items": {"$ref": "#/definitions/SaleItemRequest"}, "minItems": 1},
        "amount_paid":  {"type": "number", "description": "Payment received; defaults to 0 (fully on credit)"},
        "notes":        {"type": "string"},
        "sold_at":      {"type": "string", "format": "date-time", "description": "Defaults to now"}
      }
    },
    "CancelSaleRequest": {
      "type": "object",
      "properties": {
        "notes": {"type": "string", "description": "Optional cancellation reason"}
      }
    },
    "SaleItemResponse": {
      "type": "object",
      "properties": {
        "device_id":       {"type": "string"},
        "product_name":    {"type": "string"},
        "brand_name":      {"type": "string"},
        "imei1":           {"type": "string"},
        "imei2":           {"type": "string"},
        "sale_price":      {"type": "number"},
        "purchase_price":  {"type": "number", "description": "COGS locked at point of sale"}
      }
    },
    "SaleResponse": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "invoice_number": {"type": "string", "example": "INV-20240115-a1b2c3"},
        "customer_id":    {"type": "string"},
        "customer_name":  {"type": "string"},
        "customer_phone": {"type": "string"},
        "staff_id":       {"type": "string"},
        "staff_name":     {"type": "string"},
        "items":          {"type": "array", "items": {"$ref": "#/definitions/SaleItemResponse"}},
        "total_amount":   {"type": "number"},
        "amount_paid":    {"type": "number"},
        "balance":        {"type": "number", "description": "Remaining amount owed by customer"},
        "status":         {"type": "string", "enum": ["completed", "cancelled"]},
        "notes":          {"type": "string"},
        "sold_at":        {"type": "string", "format": "date-time"},
        "cancelled_at":   {"type": "string", "format": "date-time"},
        "created_at":     {"type": "string", "format": "date-time"},
        "updated_at":     {"type": "string", "format": "date-time"}
      }
    },
    "RecordPaymentRequest": {
      "type": "object",
      "required": ["amount"],
      "properties": {
        "amount": {"type": "number", "description": "Positive value — amount of cash received", "example": 5000},
        "notes":  {"type": "string"}
      }
    },
    "RecordAdjustmentRequest": {
      "type": "object",
      "required": ["amount", "notes"],
      "properties": {
        "amount": {"type": "number", "description": "Positive = charge (debit), negative = credit", "example": -1000},
        "notes":  {"type": "string", "description": "Required — reason for the manual adjustment"}
      }
    },
    "CreditLedgerResponse": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "customer_id":    {"type": "string"},
        "customer_name":  {"type": "string"},
        "type":           {"type": "string", "enum": ["sale", "payment", "adjustment", "cancellation"]},
        "amount":         {"type": "number", "description": "Positive = debit (owes more), negative = credit (balance reduced)"},
        "balance_after":  {"type": "number", "description": "Customer's credit_balance snapshot after this entry"},
        "reference":      {"type": "string", "description": "Invoice number or free-text label"},
        "sale_id":        {"type": "string", "description": "Linked sale ObjectID (for sale/cancellation entries)"},
        "notes":          {"type": "string"},
        "created_by":     {"type": "string", "description": "Staff email who created the entry"},
        "created_at":     {"type": "string", "format": "date-time"}
      }
    },
    "CreateLoanReferenceRequest": {
      "type": "object",
      "required": ["sale_id", "ref_name", "ref_phone"],
      "properties": {
        "sale_id":      {"type": "string", "description": "Sale ObjectID — must not be cancelled"},
        "ref_name":     {"type": "string", "example": "Hassan Ali"},
        "ref_phone":    {"type": "string", "example": "+923331234567"},
        "ref_address":  {"type": "string"},
        "relationship": {"type": "string", "example": "family", "description": "e.g. family, friend, colleague"},
        "notes":        {"type": "string"}
      }
    },
    "UpdateLoanReferenceRequest": {
      "type": "object",
      "properties": {
        "ref_name":     {"type": "string"},
        "ref_phone":    {"type": "string"},
        "ref_address":  {"type": "string"},
        "relationship": {"type": "string"},
        "notes":        {"type": "string"}
      }
    },
    "ChangeLoanReferenceStatusRequest": {
      "type": "object",
      "required": ["status"],
      "properties": {
        "status": {"type": "string", "enum": ["active", "settled", "defaulted"]},
        "notes":  {"type": "string"}
      }
    },
    "LoanReferenceResponse": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "sale_id":        {"type": "string"},
        "customer_id":    {"type": "string"},
        "invoice_number": {"type": "string"},
        "customer_name":  {"type": "string"},
        "ref_name":       {"type": "string"},
        "ref_phone":      {"type": "string"},
        "ref_address":    {"type": "string"},
        "relationship":   {"type": "string"},
        "status":         {"type": "string", "enum": ["active", "settled", "defaulted"]},
        "notes":          {"type": "string"},
        "created_by":     {"type": "string"},
        "created_at":     {"type": "string", "format": "date-time"},
        "updated_at":     {"type": "string", "format": "date-time"}
      }
    },
    "CreateBorrowLendRequest": {
      "type": "object",
      "required": ["type", "device_desc", "person_name", "person_phone"],
      "properties": {
        "type":         {"type": "string", "enum": ["borrow", "lend"]},
        "device_id":    {"type": "string", "description": "Optional — links to an inventory Device (status NOT changed)"},
        "device_desc":  {"type": "string", "example": "Samsung Galaxy S21 – IMEI: 352099001761481"},
        "person_name":  {"type": "string", "example": "Bilal Ahmad"},
        "person_phone": {"type": "string", "example": "+923011234567"},
        "customer_id":  {"type": "string", "description": "Optional — links to a Customer record"},
        "borrowed_at":  {"type": "string", "format": "date-time", "description": "Defaults to now"},
        "due_at":       {"type": "string", "format": "date-time", "description": "Expected return date"},
        "notes":        {"type": "string"}
      }
    },
    "UpdateBorrowLendRequest": {
      "type": "object",
      "properties": {
        "device_desc":  {"type": "string"},
        "person_name":  {"type": "string"},
        "person_phone": {"type": "string"},
        "due_at":       {"type": "string", "format": "date-time"},
        "notes":        {"type": "string"}
      }
    },
    "ReturnBorrowLendRequest": {
      "type": "object",
      "properties": {
        "notes": {"type": "string", "description": "Optional condition notes on receipt"}
      }
    },
    "BorrowLendResponse": {
      "type": "object",
      "properties": {
        "id":            {"type": "string"},
        "type":          {"type": "string", "enum": ["borrow", "lend"]},
        "device_id":     {"type": "string", "description": "Linked inventory Device ObjectID (if set)"},
        "device_desc":   {"type": "string"},
        "person_name":   {"type": "string"},
        "person_phone":  {"type": "string"},
        "customer_id":   {"type": "string"},
        "customer_name": {"type": "string"},
        "borrowed_at":   {"type": "string", "format": "date-time"},
        "due_at":        {"type": "string", "format": "date-time"},
        "returned_at":   {"type": "string", "format": "date-time"},
        "status":        {"type": "string", "enum": ["active", "returned", "overdue"]},
        "notes":         {"type": "string"},
        "created_by":    {"type": "string"},
        "created_at":    {"type": "string", "format": "date-time"},
        "updated_at":    {"type": "string", "format": "date-time"}
      }
    },
    "CreateBillRequest": {
      "type": "object",
      "required": ["sale_id"],
      "properties": {
        "sale_id":      {"type": "string", "description": "ObjectID of the completed sale"},
        "discount":     {"type": "number", "description": "Flat PKR deduction from subtotal (default 0)"},
        "discount_pct": {"type": "number", "description": "Informational display percentage (default 0)"},
        "tax_pct":      {"type": "number", "description": "Fractional tax rate, e.g. 0.17 for 17% GST (default 0)"},
        "notes":        {"type": "string"}
      }
    },
    "BillItemResponse": {
      "type": "object",
      "properties": {
        "device_id":       {"type": "string"},
        "product_name":    {"type": "string"},
        "brand_name":      {"type": "string"},
        "imei1":           {"type": "string"},
        "imei2":           {"type": "string"},
        "unit_price":      {"type": "number"},
        "purchase_price":  {"type": "number"}
      }
    },
    "BillResponse": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "bill_number":    {"type": "string", "example": "BILL-15-01-2024-a3f9c1"},
        "sale_id":        {"type": "string"},
        "customer_id":    {"type": "string"},
        "customer_name":  {"type": "string"},
        "customer_phone": {"type": "string"},
        "items":          {"type": "array", "items": {"$ref": "#/definitions/BillItemResponse"}},
        "subtotal":       {"type": "number"},
        "discount":       {"type": "number"},
        "discount_pct":   {"type": "number"},
        "tax":            {"type": "number"},
        "tax_pct":        {"type": "number"},
        "total_amount":   {"type": "number"},
        "amount_paid":    {"type": "number"},
        "balance":        {"type": "number"},
        "status":         {"type": "string", "enum": ["draft", "issued", "voided"]},
        "notes":          {"type": "string"},
        "issued_at":      {"type": "string", "format": "date-time"},
        "voided_at":      {"type": "string", "format": "date-time"},
        "created_by":     {"type": "string"},
        "created_at":     {"type": "string", "format": "date-time"},
        "updated_at":     {"type": "string", "format": "date-time"}
      }
    },
    "RevenueSummaryResponse": {
      "type": "object",
      "properties": {
        "from":             {"type": "string", "format": "date-time"},
        "to":               {"type": "string", "format": "date-time"},
        "total_sales":      {"type": "integer", "description": "Non-cancelled sales in range"},
        "total_revenue":    {"type": "number"},
        "total_collected":  {"type": "number"},
        "total_outstanding":{"type": "number"},
        "avg_sale_value":   {"type": "number"},
        "cancelled_count":  {"type": "integer"}
      }
    },
    "StockStatusBreakdown": {
      "type": "object",
      "properties": {
        "status": {"type": "string"},
        "count":  {"type": "integer"}
      }
    },
    "StockValuationResponse": {
      "type": "object",
      "properties": {
        "total_units":             {"type": "integer"},
        "available_units":         {"type": "integer"},
        "sold_units":              {"type": "integer"},
        "total_purchase_cost":     {"type": "number"},
        "total_potential_revenue": {"type": "number", "description": "Sum of sale_price for available devices"},
        "estimated_profit":        {"type": "number", "description": "potential_revenue minus purchase_cost of available stock"},
        "by_status":               {"type": "array", "items": {"$ref": "#/definitions/StockStatusBreakdown"}}
      }
    },
    "DebtorEntry": {
      "type": "object",
      "properties": {
        "customer_id":   {"type": "string"},
        "customer_name": {"type": "string"},
        "phone":         {"type": "string"},
        "balance":       {"type": "number"}
      }
    },
    "CreditSummaryResponse": {
      "type": "object",
      "properties": {
        "total_customers":         {"type": "integer"},
        "customers_with_balance":  {"type": "integer"},
        "total_outstanding_credit":{"type": "number"},
        "top_debtors":             {"type": "array", "items": {"$ref": "#/definitions/DebtorEntry"}}
      }
    },
    "SalesByPeriodEntry": {
      "type": "object",
      "properties": {
        "period":     {"type": "string", "description": "e.g. '2024-01' for monthly, '2024-01-15' for daily"},
        "sale_count": {"type": "integer"},
        "revenue":    {"type": "number"},
        "collected":  {"type": "number"}
      }
    },
    "TodaySalesSummary": {
      "type": "object",
      "properties": {
        "count":       {"type": "integer"},
        "revenue":     {"type": "number"},
        "collected":   {"type": "number"},
        "outstanding": {"type": "number"}
      }
    },
    "StockDashboardSummary": {
      "type": "object",
      "properties": {
        "total_units":  {"type": "integer"},
        "available":    {"type": "integer"},
        "sold":         {"type": "integer"},
        "reserved":     {"type": "integer"},
        "under_repair": {"type": "integer"}
      }
    },
    "LowStockAlert": {
      "type": "object",
      "properties": {
        "product_id":   {"type": "string"},
        "product_name": {"type": "string"},
        "brand_name":   {"type": "string"},
        "available":    {"type": "integer"},
        "threshold":    {"type": "integer"}
      }
    },
    "RecentSaleEntry": {
      "type": "object",
      "properties": {
        "sale_id":        {"type": "string"},
        "invoice_number": {"type": "string"},
        "customer_name":  {"type": "string"},
        "total_amount":   {"type": "number"},
        "status":         {"type": "string"},
        "created_at":     {"type": "string", "format": "date-time"}
      }
    },
    "DashboardResponse": {
      "type": "object",
      "properties": {
        "generated_at":            {"type": "string", "format": "date-time", "description": "Timestamp of this snapshot in IST"},
        "today_sales":             {"$ref": "#/definitions/TodaySalesSummary"},
        "stock":                   {"$ref": "#/definitions/StockDashboardSummary"},
        "total_credit_outstanding":{"type": "number"},
        "active_borrow_lends":     {"type": "integer"},
        "overdue_borrow_lends":    {"type": "integer"},
        "unread_notifications":    {"type": "integer"},
        "month_expenses":          {"type": "number", "description": "Total expenses for the current IST calendar month"},
        "recent_sales":            {"type": "array", "items": {"$ref": "#/definitions/RecentSaleEntry"}},
        "low_stock_alerts":        {"type": "array", "items": {"$ref": "#/definitions/LowStockAlert"}}
      }
    },
    "CustomerSearchResult": {
      "type": "object",
      "properties": {
        "id":    {"type": "string"},
        "name":  {"type": "string"},
        "phone": {"type": "string"},
        "email": {"type": "string"}
      }
    },
    "ProductSearchResult": {
      "type": "object",
      "properties": {
        "id":         {"type": "string"},
        "model_name": {"type": "string"},
        "brand_name": {"type": "string"},
        "barcode":    {"type": "string"}
      }
    },
    "DeviceSearchResult": {
      "type": "object",
      "properties": {
        "id":           {"type": "string"},
        "product_name": {"type": "string"},
        "brand_name":   {"type": "string"},
        "imei1":        {"type": "string"},
        "imei2":        {"type": "string"},
        "status":       {"type": "string"}
      }
    },
    "SaleSearchResult": {
      "type": "object",
      "properties": {
        "id":             {"type": "string"},
        "invoice_number": {"type": "string"},
        "customer_name":  {"type": "string"},
        "total_amount":   {"type": "number"},
        "status":         {"type": "string"}
      }
    },
    "SearchResponse": {
      "type": "object",
      "properties": {
        "query":     {"type": "string"},
        "customers": {"type": "array", "items": {"$ref": "#/definitions/CustomerSearchResult"}},
        "products":  {"type": "array", "items": {"$ref": "#/definitions/ProductSearchResult"}},
        "devices":   {"type": "array", "items": {"$ref": "#/definitions/DeviceSearchResult"}},
        "sales":     {"type": "array", "items": {"$ref": "#/definitions/SaleSearchResult"}}
      }
    },
    "CreateExpenseRequest": {
      "type": "object",
      "required": ["category", "amount", "description", "date"],
      "properties": {
        "category":    {"type": "string", "enum": ["rent", "salary", "utilities", "maintenance", "marketing", "miscellaneous"]},
        "amount":      {"type": "number", "description": "Amount in PKR, must be > 0"},
        "description": {"type": "string"},
        "date":        {"type": "string", "description": "Expense date in DD-MM-YYYY IST format"},
        "receipt_ref": {"type": "string", "description": "Optional voucher or receipt number"},
        "notes":       {"type": "string"}
      }
    },
    "UpdateExpenseRequest": {
      "type": "object",
      "properties": {
        "category":    {"type": "string", "enum": ["rent", "salary", "utilities", "maintenance", "marketing", "miscellaneous"]},
        "amount":      {"type": "number"},
        "description": {"type": "string"},
        "date":        {"type": "string", "description": "DD-MM-YYYY IST"},
        "receipt_ref": {"type": "string"},
        "notes":       {"type": "string"}
      }
    },
    "ExpenseResponse": {
      "type": "object",
      "properties": {
        "id":          {"type": "string"},
        "category":    {"type": "string"},
        "amount":      {"type": "number"},
        "description": {"type": "string"},
        "date":        {"type": "string", "format": "date-time"},
        "receipt_ref": {"type": "string"},
        "notes":       {"type": "string"},
        "created_by":  {"type": "string"},
        "created_at":  {"type": "string", "format": "date-time"},
        "updated_at":  {"type": "string", "format": "date-time"}
      }
    },
    "ExpenseCategoryBreakdown": {
      "type": "object",
      "properties": {
        "category": {"type": "string"},
        "total":    {"type": "number"},
        "count":    {"type": "integer"}
      }
    },
    "ExpenseSummaryResponse": {
      "type": "object",
      "properties": {
        "from":         {"type": "string", "format": "date-time"},
        "to":           {"type": "string", "format": "date-time"},
        "total_amount": {"type": "number"},
        "total_count":  {"type": "integer"},
        "by_category":  {"type": "array", "items": {"$ref": "#/definitions/ExpenseCategoryBreakdown"}}
      }
    },
    "UpdateSettingsRequest": {
      "type": "object",
      "properties": {
        "store_name":          {"type": "string"},
        "store_tagline":       {"type": "string"},
        "store_address":       {"type": "string"},
        "store_phone":         {"type": "string"},
        "store_email":         {"type": "string"},
        "currency":            {"type": "string", "example": "PKR"},
        "default_tax_pct":     {"type": "number", "description": "Fractional tax rate, e.g. 0.17 for 17% GST"},
        "low_stock_threshold": {"type": "integer", "description": "Fire low_stock alert when available units fall below this. 0 = disabled."},
        "credit_ceiling":      {"type": "number", "description": "Fire credit_due alert when customer balance exceeds this. 0 = disabled."},
        "bill_header_text":    {"type": "string"},
        "bill_footer_text":    {"type": "string"},
        "receipt_footer":      {"type": "string"}
      }
    },
    "SettingsResponse": {
      "type": "object",
      "properties": {
        "id":                  {"type": "string"},
        "store_id":            {"type": "string", "example": "default"},
        "store_name":          {"type": "string"},
        "store_tagline":       {"type": "string"},
        "store_address":       {"type": "string"},
        "store_phone":         {"type": "string"},
        "store_email":         {"type": "string"},
        "currency":            {"type": "string"},
        "default_tax_pct":     {"type": "number"},
        "low_stock_threshold": {"type": "integer"},
        "credit_ceiling":      {"type": "number"},
        "bill_header_text":    {"type": "string"},
        "bill_footer_text":    {"type": "string"},
        "receipt_footer":      {"type": "string"},
        "updated_by":          {"type": "string"},
        "created_at":          {"type": "string", "format": "date-time"},
        "updated_at":          {"type": "string", "format": "date-time"}
      }
    },
    "CreateNotificationRequest": {
      "type": "object",
      "required": ["type", "title", "body"],
      "properties": {
        "type":            {"type": "string", "enum": ["low_stock", "overdue", "credit_due", "sale_cancel", "general"]},
        "title":           {"type": "string", "maxLength": 120},
        "body":            {"type": "string"},
        "recipient_email": {"type": "string", "description": "Target staff email. Empty = broadcast to all staff."},
        "customer_id":     {"type": "string"},
        "sale_id":         {"type": "string"},
        "ref_id":          {"type": "string", "description": "Generic entity ID for deep-link navigation"}
      }
    },
    "NotificationResponse": {
      "type": "object",
      "properties": {
        "id":               {"type": "string"},
        "type":             {"type": "string", "enum": ["low_stock", "overdue", "credit_due", "sale_cancel", "general"]},
        "title":            {"type": "string"},
        "body":             {"type": "string"},
        "status":           {"type": "string", "enum": ["unread", "read", "dismissed"]},
        "recipient_email":  {"type": "string"},
        "customer_id":      {"type": "string"},
        "sale_id":          {"type": "string"},
        "ref_id":           {"type": "string"},
        "created_by":       {"type": "string"},
        "created_at":       {"type": "string", "format": "date-time"},
        "read_at":          {"type": "string", "format": "date-time"}
      }
    },
    "UnreadCountResponse": {
      "type": "object",
      "properties": {
        "count": {"type": "integer", "description": "Number of unread notifications visible to the caller"}
      }
    }
  },
  "tags": [
    {"name": "health",    "description": "Service health"},
    {"name": "auth",      "description": "Authentication and profile"},
    {"name": "users",     "description": "User management (admin only)"},
    {"name": "brands",    "description": "Brand catalogue"},
    {"name": "products",  "description": "Product catalogue"},
    {"name": "devices",   "description": "Inventory — physical handset units"},
    {"name": "stock",     "description": "Stock summary and reports"},
    {"name": "vendors",   "description": "Vendor / supplier directory"},
    {"name": "purchases", "description": "Purchase orders and stock intake"},
    {"name": "customers",        "description": "Customer directory"},
    {"name": "sales",            "description": "Sale invoices and revenue tracking"},
    {"name": "loan-references",  "description": "Guarantor references for credit sales"},
    {"name": "borrow-lends",     "description": "Device borrow and lend tracking"},
    {"name": "bills",            "description": "Formal billing documents generated from completed sales"},
    {"name": "reports",          "description": "Read-only analytics: revenue, stock, credit, and period breakdowns (admin only)"},
    {"name": "notifications",    "description": "In-app alerts: broadcast and targeted notifications with read/dismiss lifecycle"},
    {"name": "settings",         "description": "Singleton store configuration: branding, tax, currency, and alert thresholds"},
    {"name": "expenses",         "description": "Operational expense tracking: rent, salary, utilities, and more"},
    {"name": "dashboard",        "description": "PWA home-screen summary: today's KPIs, stock, credit, borrow-lends, notifications, expenses"},
    {"name": "search",           "description": "Global search across customers, products, devices, and sales"}
  ]
}`

func init() {
	swag.Register(SwaggerInfo.InstanceName(), SwaggerInfo)
}
