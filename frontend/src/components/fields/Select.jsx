import { Children, isValidElement } from 'react'
import Combobox from './Combobox.jsx'

const text = (n) => (n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.props?.children) : String(n))

function collect(children, out = []) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    if (c.type === 'option') {
      const label = text(c.props.children)
      out.push({ value: String(c.props.value ?? label), label: label || '—', empty: (c.props.value ?? label) === '' })
    } else if (c.props?.children) collect(c.props.children, out)
  })
  return out
}

/**
 * Drop-in for a native <select> with <option> children, rendered with the app's Combobox
 * (same look and keyboard behaviour as every form dropdown). onChange receives { target: { value } }.
 * Only width / margin / flex classes from className are kept: the Combobox draws its own border, height and text.
 */
export default function Select({ value, onChange, children, disabled, className, id, placeholder, 'aria-label': ariaLabel }) {
  const all = collect(children)
  const options = all.filter((o) => !o.empty)
  const emptyLabel = all.find((o) => o.empty)?.label
  return (
    <Combobox
      id={id}
      className={className?.split(/\s+/).filter((c) => /^(?:[a-z]+:)*(?:w-|min-w-|max-w-|flex-|shrink|grow|m[trblxyse]?-|col-|self-)/.test(c)).join(' ')}
      disabled={disabled}
      searchable={options.length > 8}
      value={value == null ? '' : String(value)}
      options={options}
      placeholder={emptyLabel && emptyLabel !== '—' ? emptyLabel : placeholder ?? 'Select…'}
      onChange={(v) => { if (!v && !emptyLabel) return; onChange?.({ target: { value: v ?? '' } }) }}
      aria-label={ariaLabel}
    />
  )
}
