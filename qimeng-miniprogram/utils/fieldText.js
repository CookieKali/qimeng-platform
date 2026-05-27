/**
 * Normalize profile/card field values to plain text for forms and API.
 * Handles strings, numbers, JSON arrays (resources/needs), and objects.
 */
function toPlainText(value) {
  if (value == null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return toPlainText(item)
    }).filter(function (s) { return !!s }).join(' · ')
  }
  if (typeof value === 'object') {
    var parts = []
    ;['title', 'name', 'text', 'label', 'value', 'content'].forEach(function (k) {
      if (value[k] != null && String(value[k]).trim()) {
        parts.push(String(value[k]).trim())
      }
    })
    if (parts.length) return parts.join(' · ')
    try {
      return JSON.stringify(value)
    } catch (e) {
      return ''
    }
  }
  return String(value).trim()
}

module.exports = {
  toPlainText: toPlainText
}
