package figma

import (
	"math"
	"strings"

	"sigma/internal/design"
)

type pathPoint struct {
	X, Y float64
}

type pathSegment struct {
	P0, P1, P2, P3 pathPoint
	Line           bool
}

type pathBuilder struct {
	subpaths []design.VectorSubpath
	current  []design.VectorPoint
	start    pathPoint
	cmd      pathPoint
	lastC    *pathPoint
	lastQ    *pathPoint
	hasMove  bool
}

// parsePathData converts SVG/Figma path data (M/L/H/V/C/S/Q/T/Z) into
// normalized Sigma subpaths. Arcs are approximated by their endpoint.
func parsePathData(data string) []design.VectorSubpath {
	b := &pathBuilder{}
	tokens := tokenizePath(data)
	var cmd byte
	i := 0
	for i < len(tokens) {
		if isPathCommand(tokens[i]) {
			cmd = tokens[i][0]
			i++
		}
		if cmd == 'Z' || cmd == 'z' {
			b.close()
			cmd = 0
			continue
		}
		if i >= len(tokens) {
			break
		}
		switch cmd {
		case 'M', 'm':
			if i+1 >= len(tokens) {
				return b.finish()
			}
			x, y := num(tokens[i]), num(tokens[i+1])
			i += 2
			if cmd == 'm' {
				x += b.cmd.X
				y += b.cmd.Y
			}
			b.move(x, y)
			if cmd == 'M' {
				cmd = 'L'
			} else {
				cmd = 'l'
			}
		case 'L', 'l':
			if i+1 >= len(tokens) {
				return b.finish()
			}
			x, y := num(tokens[i]), num(tokens[i+1])
			i += 2
			if cmd == 'l' {
				x += b.cmd.X
				y += b.cmd.Y
			}
			b.line(x, y)
		case 'H', 'h':
			x := num(tokens[i])
			i++
			if cmd == 'h' {
				x += b.cmd.X
			}
			b.line(x, b.cmd.Y)
		case 'V', 'v':
			y := num(tokens[i])
			i++
			if cmd == 'v' {
				y += b.cmd.Y
			}
			b.line(b.cmd.X, y)
		case 'C', 'c':
			if i+5 >= len(tokens) {
				return b.finish()
			}
			x1, y1 := num(tokens[i]), num(tokens[i+1])
			x2, y2 := num(tokens[i+2]), num(tokens[i+3])
			x, y := num(tokens[i+4]), num(tokens[i+5])
			i += 6
			if cmd == 'c' {
				x1 += b.cmd.X
				y1 += b.cmd.Y
				x2 += b.cmd.X
				y2 += b.cmd.Y
				x += b.cmd.X
				y += b.cmd.Y
			}
			b.cubic(pathPoint{x1, y1}, pathPoint{x2, y2}, pathPoint{x, y})
		case 'S', 's':
			if i+3 >= len(tokens) {
				return b.finish()
			}
			x2, y2 := num(tokens[i]), num(tokens[i+1])
			x, y := num(tokens[i+2]), num(tokens[i+3])
			i += 4
			if cmd == 's' {
				x2 += b.cmd.X
				y2 += b.cmd.Y
				x += b.cmd.X
				y += b.cmd.Y
			}
			c1 := b.cmd
			if b.lastC != nil {
				c1 = pathPoint{2*b.cmd.X - b.lastC.X, 2*b.cmd.Y - b.lastC.Y}
			}
			b.cubic(c1, pathPoint{x2, y2}, pathPoint{x, y})
		case 'Q', 'q':
			if i+3 >= len(tokens) {
				return b.finish()
			}
			qx, qy := num(tokens[i]), num(tokens[i+1])
			x, y := num(tokens[i+2]), num(tokens[i+3])
			i += 4
			if cmd == 'q' {
				qx += b.cmd.X
				qy += b.cmd.Y
				x += b.cmd.X
				y += b.cmd.Y
			}
			b.quad(pathPoint{qx, qy}, pathPoint{x, y})
		case 'T', 't':
			if i+1 >= len(tokens) {
				return b.finish()
			}
			x, y := num(tokens[i]), num(tokens[i+1])
			i += 2
			if cmd == 't' {
				x += b.cmd.X
				y += b.cmd.Y
			}
			q := b.cmd
			if b.lastQ != nil {
				q = pathPoint{2*b.cmd.X - b.lastQ.X, 2*b.cmd.Y - b.lastQ.Y}
			}
			b.quad(q, pathPoint{x, y})
		case 'A', 'a':
			// Endpoint approximation for arcs (Figma vectors normally use M/L/C).
			if i+6 >= len(tokens) {
				return b.finish()
			}
			x, y := num(tokens[i+5]), num(tokens[i+6])
			i += 7
			if cmd == 'a' {
				x += b.cmd.X
				y += b.cmd.Y
			}
			b.line(x, y)
		case 'Z', 'z':
			b.close()
			cmd = 0
		default:
			i++
		}
	}
	return b.finish()
}

func (b *pathBuilder) move(x, y float64) {
	b.flush()
	b.start = pathPoint{x, y}
	b.current = []design.VectorPoint{{X: x, Y: y}}
	b.cmd = b.start
	b.lastC, b.lastQ = nil, nil
	b.hasMove = true
}

func (b *pathBuilder) line(x, y float64) {
	if !b.hasMove {
		b.move(x, y)
		return
	}
	b.current = append(b.current, design.VectorPoint{X: x, Y: y})
	b.cmd = pathPoint{x, y}
	b.lastC, b.lastQ = nil, nil
}

func (b *pathBuilder) cubic(c1, c2, p pathPoint) {
	if !b.hasMove {
		b.move(p.X, p.Y)
		return
	}
	// The previous point stores the outgoing handle; the new point stores the incoming handle.
	if len(b.current) > 0 {
		last := &b.current[len(b.current)-1]
		last.Out = &design.VectorHandle{X: c1.X, Y: c1.Y}
	}
	b.current = append(b.current, design.VectorPoint{X: p.X, Y: p.Y, In: &design.VectorHandle{X: c2.X, Y: c2.Y}})
	b.cmd = p
	l := c2
	b.lastC = &l
	b.lastQ = nil
}

func (b *pathBuilder) quad(q, p pathPoint) {
	c1 := pathPoint{b.cmd.X + 2.0/3.0*(q.X-b.cmd.X), b.cmd.Y + 2.0/3.0*(q.Y-b.cmd.Y)}
	c2 := pathPoint{p.X + 2.0/3.0*(q.X-p.X), p.Y + 2.0/3.0*(q.Y-p.Y)}
	b.cubic(c1, c2, p)
	l := q
	b.lastQ = &l
	b.lastC = nil
}

func (b *pathBuilder) close() {
	if len(b.current) == 0 {
		return
	}
	b.subpaths = append(b.subpaths, design.VectorSubpath{Points: b.current, Closed: true})
	b.current = nil
	b.cmd = b.start
	b.lastC, b.lastQ = nil, nil
}

func (b *pathBuilder) flush() {
	if len(b.current) == 0 {
		return
	}
	b.subpaths = append(b.subpaths, design.VectorSubpath{Points: b.current, Closed: false})
	b.current = nil
}

func (b *pathBuilder) finish() []design.VectorSubpath {
	b.flush()
	return b.subpaths
}

func tokenizePath(s string) []string {
	out := []string{}
	for i := 0; i < len(s); {
		c := s[i]
		if c == ' ' || c == ',' || c == '\n' || c == '\r' || c == '\t' {
			i++
			continue
		}
		if isCmdByte(c) {
			out = append(out, string(c))
			i++
			continue
		}
		start := i
		if c == '-' || c == '+' {
			i++
		}
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			i++
		}
		if i < len(s) && s[i] == '.' {
			i++
			for i < len(s) && s[i] >= '0' && s[i] <= '9' {
				i++
			}
		}
		if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
			i++
			if i < len(s) && (s[i] == '-' || s[i] == '+') {
				i++
			}
			for i < len(s) && s[i] >= '0' && s[i] <= '9' {
				i++
			}
		}
		if i > start {
			out = append(out, s[start:i])
		} else {
			i++
		}
	}
	return out
}

func isCmdByte(c byte) bool       { return strings.ContainsRune("MmLlHhVvCcSsQqTtAaZz", rune(c)) }
func isPathCommand(s string) bool { return len(s) == 1 && isCmdByte(s[0]) }
func num(s string) float64 {
	var f float64
	_, _ = fmtSscan(s, &f)
	return f
}

// kept local to avoid pulling fmt into the hot parser path
func fmtSscan(s string, f *float64) (int, error) {
	var v float64
	var sign float64 = 1
	i := 0
	if i < len(s) && (s[i] == '-' || s[i] == '+') {
		if s[i] == '-' {
			sign = -1
		}
		i++
	}
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		v = v*10 + float64(s[i]-'0')
		i++
	}
	if i < len(s) && s[i] == '.' {
		i++
		scale := 0.1
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			v += float64(s[i]-'0') * scale
			scale *= 0.1
			i++
		}
	}
	if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
		i++
		exp := 0
		esign := 1
		if i < len(s) && (s[i] == '-' || s[i] == '+') {
			if s[i] == '-' {
				esign = -1
			}
			i++
		}
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			exp = exp*10 + int(s[i]-'0')
			i++
		}
		v *= math.Pow(10, float64(exp*esign))
	}
	*f = sign * v
	return i, nil
}
