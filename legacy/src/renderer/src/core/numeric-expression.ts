type Token = { kind: 'number'; value: number } | { kind: 'operator'; value: '+' | '-' | '*' | '/' | '(' | ')' }

const tokenize = (source: string): Token[] | null => {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const character = source[index]
    if (/\s/.test(character)) { index += 1; continue }
    if ('+-*/()'.includes(character)) {
      tokens.push({ kind: 'operator', value: character as '+' | '-' | '*' | '/' | '(' | ')' })
      index += 1
      continue
    }
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i)
    if (!match) return null
    const value = Number(match[0])
    if (!Number.isFinite(value)) return null
    tokens.push({ kind: 'number', value })
    index += match[0].length
  }
  return tokens
}

export function evaluateNumericExpression(source: string): number | null {
  const tokens = tokenize(source)
  if (!tokens?.length) return null
  let index = 0

  const parsePrimary = (): number | null => {
    const token = tokens[index]
    if (!token) return null
    if (token.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      index += 1
      const value = parsePrimary()
      return value === null ? null : token.value === '-' ? -value : value
    }
    if (token.kind === 'operator' && token.value === '(') {
      index += 1
      const value = parseSum()
      if (value === null || tokens[index]?.kind !== 'operator' || tokens[index].value !== ')') return null
      index += 1
      return value
    }
    if (token.kind !== 'number') return null
    index += 1
    return token.value
  }

  const parseProduct = (): number | null => {
    let value = parsePrimary()
    if (value === null) return null
    while (tokens[index]?.kind === 'operator' && (tokens[index].value === '*' || tokens[index].value === '/')) {
      const operator = tokens[index].value
      index += 1
      const right = parsePrimary()
      if (right === null || (operator === '/' && right === 0)) return null
      value = operator === '*' ? value * right : value / right
      if (!Number.isFinite(value)) return null
    }
    return value
  }

  const parseSum = (): number | null => {
    let value = parseProduct()
    if (value === null) return null
    while (tokens[index]?.kind === 'operator' && (tokens[index].value === '+' || tokens[index].value === '-')) {
      const operator = tokens[index].value
      index += 1
      const right = parseProduct()
      if (right === null) return null
      value = operator === '+' ? value + right : value - right
      if (!Number.isFinite(value)) return null
    }
    return value
  }

  const result = parseSum()
  return result !== null && index === tokens.length ? result : null
}
