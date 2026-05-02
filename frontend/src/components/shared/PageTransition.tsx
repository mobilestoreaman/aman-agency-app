interface Props {
  children: React.ReactNode
}

export default function PageTransition({ children }: Props) {
  return (
    <div className="animate-fade-in">
      {children}
    </div>
  )
}
