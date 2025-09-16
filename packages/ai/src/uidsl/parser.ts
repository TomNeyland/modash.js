/**
 * UIDSL v1 Parser - Ultra-compact Terminal UI DSL
 * 
 * Parses UIDSL strings into AST for Ink component compilation
 * 
 * Grammar (informal):
 * UI   := 'ui:v1;' COMP
 * COMP := g(...) [ ... ] | tb(...) [ ... ] | t(...) | li(...) | tr(...) | st(...) | sk(...) | br(...) | js(...)
 * 
 * Type codes:
 * - Containers: g (grid), tb (tabs)
 * - Leaves: t (table), li (list), tr (tree), st (stat), sk (sparkline), br (bar), js (raw JSON)
 * 
 * Props (short):
 * i=id, f=from(JSONPath), dr=dir(R|C), gp=gap, ti=tab titles, c=columns, s=sort, pg=page,
 * lb=label, v=value, u=unit, x/y=axes, st=style
 */

export interface UIPosition {
  line: number;
  column: number;
}

export interface UIToken {
  type: 'identifier' | 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'equals' | 'comma' | 'string' | 'colon' | 'semicolon' | 'pipe';
  value: string;
  position: UIPosition;
}

export type UIComponentType = 'g' | 'tb' | 't' | 'li' | 'tr' | 'st' | 'sk' | 'br' | 'js';

export interface UIProps {
  i?: string;    // id
  f?: string;    // from (JSONPath)
  dr?: 'R' | 'C'; // direction (Row/Column)
  gp?: number;   // gap
  ti?: string;   // tab titles (comma-separated)
  c?: string;    // columns (pipe-separated: Header:path[:align[:width]])
  s?: string;    // sort (field:order)
  pg?: number;   // page size
  lb?: string;   // label
  v?: string;    // value
  u?: string;    // unit
  x?: string;    // x-axis
  y?: string;    // y-axis
  st?: 'json' | 'compact'; // style
}

export interface UIComponent {
  type: UIComponentType;
  props: UIProps;
  children?: UIComponent[];
  position: UIPosition;
}

export interface UIAst {
  version: 'v1';
  root: UIComponent;
}

export class UIDSLParseError extends Error {
  constructor(
    message: string,
    public position: UIPosition
  ) {
    super(`UIDSL Parse Error at line ${position.line}, column ${position.column}: ${message}`);
    this.name = 'UIDSLParseError';
  }
}

export class UIDSLScanner {
  private pos = 0;
  private line = 1;
  private column = 1;
  
  constructor(private input: string) {}

  private peek(offset = 0): string {
    const index = this.pos + offset;
    return index < this.input.length ? this.input[index] : '';
  }

  private advance(): string {
    if (this.pos >= this.input.length) return '';
    
    const char = this.input[this.pos];
    this.pos++;
    
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    
    return char;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  private getPosition(): UIPosition {
    return { line: this.line, column: this.column };
  }

  private scanString(): string {
    let value = '';
    let quote = this.advance(); // Skip opening quote
    
    while (this.pos < this.input.length) {
      const char = this.peek();
      if (char === quote) {
        this.advance(); // Skip closing quote
        break;
      }
      if (char === '\\') {
        this.advance(); // Skip escape char
        const escaped = this.advance();
        value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
      } else {
        value += this.advance();
      }
    }
    
    return value;
  }

  private scanIdentifier(): string {
    let value = '';
    while (this.pos < this.input.length && /[a-zA-Z0-9_$./]/.test(this.peek())) {
      value += this.advance();
    }
    return value;
  }

  private scanNumber(): string {
    let value = '';
    while (this.pos < this.input.length && /[0-9.]/.test(this.peek())) {
      value += this.advance();
    }
    return value;
  }

  public scan(): UIToken[] {
    const tokens: UIToken[] = [];
    
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      
      if (this.pos >= this.input.length) break;
      
      const char = this.peek();
      const position = this.getPosition();
      
      switch (char) {
        case '(':
          tokens.push({ type: 'lparen', value: this.advance(), position });
          break;
        case ')':
          tokens.push({ type: 'rparen', value: this.advance(), position });
          break;
        case '[':
          tokens.push({ type: 'lbracket', value: this.advance(), position });
          break;
        case ']':
          tokens.push({ type: 'rbracket', value: this.advance(), position });
          break;
        case '=':
          tokens.push({ type: 'equals', value: this.advance(), position });
          break;
        case ',':
          tokens.push({ type: 'comma', value: this.advance(), position });
          break;
        case ':':
          tokens.push({ type: 'colon', value: this.advance(), position });
          break;
        case ';':
          tokens.push({ type: 'semicolon', value: this.advance(), position });
          break;
        case '|':
          tokens.push({ type: 'pipe', value: this.advance(), position });
          break;
        case '"':
        case "'":
          tokens.push({ type: 'string', value: this.scanString(), position });
          break;
        default:
          if (/[a-zA-Z_$]/.test(char)) {
            tokens.push({ type: 'identifier', value: this.scanIdentifier(), position });
          } else if (/[0-9]/.test(char)) {
            tokens.push({ type: 'string', value: this.scanNumber(), position });
          } else {
            throw new UIDSLParseError(`Unexpected character: ${char}`, position);
          }
      }
    }
    
    return tokens;
  }
}

export class UIDSLParser {
  private pos = 0;
  
  constructor(private tokens: UIToken[]) {}

  private peek(offset = 0): UIToken | null {
    const index = this.pos + offset;
    return index < this.tokens.length ? this.tokens[index] : null;
  }

  private advance(): UIToken | null {
    if (this.pos >= this.tokens.length) return null;
    return this.tokens[this.pos++];
  }

  private expect(type: UIToken['type']): UIToken {
    const token = this.advance();
    if (!token || token.type !== type) {
      const pos = token?.position || { line: 0, column: 0 };
      throw new UIDSLParseError(`Expected ${type}, got ${token?.type || 'EOF'}`, pos);
    }
    return token;
  }

  private parseProps(): UIProps {
    const props: UIProps = {};
    
    while (this.peek() && this.peek()!.type !== 'rparen') {
      const propName = this.expect('identifier');
      this.expect('equals');
      
      // Parse property value - it can be a simple value or a complex string with special chars
      let value: any;
      const nextToken = this.peek();
      
      if (nextToken?.type === 'string') {
        value = this.advance()?.value;
      } else {
        // Parse as identifier/expression, allowing complex values
        const valueTokens: string[] = [];
        while (this.peek() && 
               this.peek()!.type !== 'comma' && 
               this.peek()!.type !== 'rparen') {
          const token = this.advance();
          if (token) {
            valueTokens.push(token.value);
          }
        }
        value = valueTokens.join('');
      }
      
      if (!value) {
        throw new UIDSLParseError('Expected property value', propName.position);
      }
      
      // Convert prop values to appropriate types
      const key = propName.value as keyof UIProps;
      
      // Type conversions
      if (key === 'gp' || key === 'pg') {
        const numValue = parseInt(value, 10);
        value = isNaN(numValue) ? value : numValue;
      } else if (key === 'dr' && (value === 'R' || value === 'C')) {
        value = value as 'R' | 'C';
      } else if (key === 'st' && (value === 'json' || value === 'compact')) {
        value = value as 'json' | 'compact';
      }
      
      (props as any)[key] = value;
      
      // Handle comma separator
      if (this.peek()?.type === 'comma') {
        this.advance();
      }
    }
    
    return props;
  }

  private parseComponent(): UIComponent {
    const typeToken = this.expect('identifier');
    const type = typeToken.value as UIComponentType;
    
    // Validate component type
    const validTypes = ['g', 'tb', 't', 'li', 'tr', 'st', 'sk', 'br', 'js'];
    if (!validTypes.includes(type)) {
      throw new UIDSLParseError(`Invalid component type: ${type}`, typeToken.position);
    }
    
    this.expect('lparen');
    const props = this.parseProps();
    this.expect('rparen');
    
    const component: UIComponent = {
      type,
      props,
      position: typeToken.position
    };
    
    // Handle containers with children
    if (type === 'g' || type === 'tb') {
      if (this.peek()?.type === 'lbracket') {
        this.advance(); // consume '['
        
        const children: UIComponent[] = [];
        while (this.peek() && this.peek()!.type !== 'rbracket') {
          children.push(this.parseComponent());
          
          // Handle comma separator
          if (this.peek()?.type === 'comma') {
            this.advance();
          }
        }
        
        this.expect('rbracket');
        component.children = children;
      }
    }
    
    return component;
  }

  public parse(): UIAst {
    // Expect ui:v1; prefix
    const ui = this.expect('identifier');
    if (ui.value !== 'ui') {
      throw new UIDSLParseError('Expected "ui" prefix', ui.position);
    }
    
    this.expect('colon');
    
    const version = this.expect('identifier');
    if (version.value !== 'v1') {
      throw new UIDSLParseError('Expected version "v1"', version.position);
    }
    
    this.expect('semicolon');
    
    // Parse root component
    const root = this.parseComponent();
    
    return {
      version: 'v1',
      root
    };
  }
}

/**
 * Parse UIDSL string into AST
 */
export function parseUIDSL(input: string): UIAst {
  try {
    const scanner = new UIDSLScanner(input);
    const tokens = scanner.scan();
    const parser = new UIDSLParser(tokens);
    return parser.parse();
  } catch (error) {
    if (error instanceof UIDSLParseError) {
      throw error;
    }
    throw new UIDSLParseError(`Parse error: ${error}`, { line: 0, column: 0 });
  }
}

/**
 * Fallback parser for malformed UIDSL - returns safe default
 */
export function parseUIDSLSafe(input: string): UIAst {
  try {
    return parseUIDSL(input);
  } catch (error) {
    console.warn(`UIDSL parse failed, using fallback: ${error}`);
    
    // Return safe fallback - either JSON view or simple table
    return {
      version: 'v1',
      root: {
        type: 'js',
        props: { f: '$', st: 'json' },
        position: { line: 1, column: 1 }
      }
    };
  }
}