export function parseAttributes(attrSource: string | null | undefined): Record<string, string>

export function startTags(
  html: string,
  tagName: string,
): { raw: string; attrs: Record<string, string> }[]

export function documentTitle(html: string): string

export function metaContents(html: string, key: string, value: string): string[]

export function uniqueMeta(
  html: string,
  key: string,
  value: string,
): { ok: boolean; count: number; content?: string; contents: string[] }

export function linkHrefs(html: string, rel: string): string[]

export function uniqueLink(
  html: string,
  rel: string,
): { ok: boolean; count: number; href?: string; hrefs: string[] }
