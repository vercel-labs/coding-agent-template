import Image from 'next/image'

interface GeminiProps {
  className?: string
  width?: number
  height?: number
}

const Gemini = ({ className = 'w-6 h-6', width = 24, height = 24 }: GeminiProps) => (
  <Image src="/logos/gemini.svg" alt="Gemini" width={width} height={height} className={className} />
)

export default Gemini
