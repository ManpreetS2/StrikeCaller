/**
 * Small HTML start-tag helpers for Pages/metadata verification.
 * Handles attribute order; does not execute scripts or decode entities beyond quotes.
 */

const START_TAG = (name) => new RegExp(`<${name}\\b([^>]*)>`, 'gi')
const ATTR = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

export function parseAttributes(attrSource) {
  const attrs = {}
  const source = String(attrSource ?? '')
  ATTR.lastIndex = 0
  let match
  while ((match = ATTR.exec(source))) {
    const key = match[1].toLowerCase()
    if (key === '/' || key === '') continue
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

export function startTags(html, tagName) {
  const tags = []
  const re = START_TAG(tagName)
  let match
  while ((match = re.exec(html))) {
    tags.push({ raw: match[0], attrs: parseAttributes(match[1]) })
  }
  return tags
}

export function documentTitle(html) {
  const match = String(html).match(/<title>([^<]*)<\/title>/i)
  return match ? match[1].trim() : ''
}

export function metaContents(html, key, value) {
  const needle = String(value).toLowerCase()
  return startTags(html, 'meta')
    .filter((tag) => (tag.attrs[key] ?? '').toLowerCase() === needle)
    .map((tag) => tag.attrs.content ?? '')
}

export function uniqueMeta(html, key, value) {
  const contents = metaContents(html, key, value)
  if (contents.length !== 1) {
    return { ok: false, count: contents.length, contents }
  }
  return { ok: true, count: 1, content: contents[0], contents }
}

export function linkHrefs(html, rel) {
  const needle = String(rel).toLowerCase()
  return startTags(html, 'link')
    .filter((tag) => (tag.attrs.rel ?? '').toLowerCase() === needle)
    .map((tag) => tag.attrs.href ?? '')
}

export function uniqueLink(html, rel) {
  const hrefs = linkHrefs(html, rel)
  if (hrefs.length !== 1) {
    return { ok: false, count: hrefs.length, hrefs }
  }
  return { ok: true, count: 1, href: hrefs[0], hrefs }
}
