import * as React from 'react'
import type { SVGProps } from 'react'

const OpenCode = (props: SVGProps<SVGSVGElement>) => (
  <svg width="1em" height="1em" viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="600" height="600" fill="black" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M115 180H300V420H115V180ZM253.75 229.044H161.25V370.405H253.75V229.044Z"
      fill="white"
    />
    <path d="M346.25 180H485V229.044H392.5V370.405H485V419.449H346.25V180Z" fill="white" />
  </svg>
)

export default OpenCode
