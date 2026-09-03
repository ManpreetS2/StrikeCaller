import { createContext, useContext } from 'react'

export interface DimIds {
  face: string
  accent: string
  edge: string
  shadow: string
}

export const DimIdContext = createContext<DimIds>({
  face: 'dimFace',
  accent: 'dimAccent',
  edge: 'dimEdge',
  shadow: 'dimShadow',
})

export function useDimIds(): DimIds {
  return useContext(DimIdContext)
}
