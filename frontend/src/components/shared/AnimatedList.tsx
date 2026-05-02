import { Children } from 'react'

interface Props {
  children: React.ReactNode[]
}

export default function AnimatedList({ children }: Props) {
  const childArray = Children.toArray(children)
  const maxStaggered = Math.min(8, childArray.length)

  return (
    <>
      {childArray.map((child, i) => {
        // Only stagger up to 8 items
        const isStaggered = i < maxStaggered
        const delay = isStaggered ? i * 0.04 : 0

        return (
          <div
            key={i}
            style={{
              animation: 'fade-in 0.2s ease-out both',
              animationDelay: `${delay}s`,
            }}
          >
            {child}
          </div>
        )
      })}
    </>
  )
}

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        animation: 'fade-in 0.2s ease-out both',
      }}
    >
      {children}
    </div>
  )
}
