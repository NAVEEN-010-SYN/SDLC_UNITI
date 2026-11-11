import type { Shadow, ThemeSet, Token, Typography } from '../tokens';
import { camel, GENERATED_HEADER, hexToRgba, toPoints } from './format';

const SWIFT_WEIGHTS: Record<number, string> = {
  100: 'ultraLight', 200: 'thin', 300: 'light', 400: 'regular', 500: 'medium',
  600: 'semibold', 700: 'bold', 800: 'heavy', 900: 'black',
};

const SECTIONS: Array<{ root: string; enumName: string }> = [
  { root: 'color', enumName: 'Colors' },
  { root: 'space', enumName: 'Spacing' },
  { root: 'radius', enumName: 'Radius' },
  { root: 'elevation', enumName: 'Elevation' },
  { root: 'typography', enumName: 'Typography' },
];

/** `color.bg.canvas` -> `bgCanvas`; identifiers may not start with a digit, so `space.4` -> `space4`. */
export function swiftIdentifier(path: string[]): string {
  const rest = path.slice(1);
  const id = camel(rest);
  return /^[0-9]/.test(id) ? camel([path[0], ...rest]) : id;
}

const fixed = (n: number) => Number(n.toFixed(4)).toString();

function rgba(hex: string): string {
  const { r, g, b, a } = hexToRgba(hex);
  return `RGBA(${fixed(r / 255)}, ${fixed(g / 255)}, ${fixed(b / 255)}, ${fixed(a)})`;
}

function shadow(s: Shadow): string {
  return `UnitiShadow(color: ${rgba(s.color)}, x: ${toPoints(s.offsetX)}, y: ${toPoints(s.offsetY)}, blur: ${toPoints(s.blur)}, spread: ${toPoints(s.spread)})`;
}

function declaration(light: Token, dark: Token | undefined): string {
  const name = swiftIdentifier(light.path);
  switch (light.type) {
    case 'color':
      return `public static let ${name} = UnitiColor(light: ${rgba(light.value as string)}, dark: ${rgba((dark ?? light).value as string)})`;
    case 'dimension':
      return `public static let ${name}: CGFloat = ${toPoints(light.value as string)}`;
    case 'shadow':
      return `public static let ${name} = UnitiThemedShadow(light: ${shadow(light.value as Shadow)}, dark: ${shadow((dark ?? light).value as Shadow)})`;
    case 'typography': {
      const t = light.value as Typography;
      const weight = SWIFT_WEIGHTS[t.fontWeight] ?? 'regular';
      return `public static let ${name} = UnitiTextStyle(family: "${t.fontFamily[0]}", size: ${toPoints(t.fontSize)}, weight: .${weight}, lineHeightMultiple: ${t.lineHeight})`;
    }
    default:
      throw new Error(`no Swift mapping for ${light.type} (${light.path.join('.')})`);
  }
}

const SUPPORT = `public struct RGBA: Equatable { public let r, g, b, a: Double
    public init(_ r: Double, _ g: Double, _ b: Double, _ a: Double) { self.r = r; self.g = g; self.b = b; self.a = a }
    var uiColor: UIColor { UIColor(red: r, green: g, blue: b, alpha: a) }
}

public struct UnitiColor {
    public let light: RGBA
    public let dark: RGBA
    /// Resolves against the current trait collection, so it follows the system appearance.
    public var color: Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? dark.uiColor : light.uiColor })
    }
}

public struct UnitiShadow { public let color: RGBA; public let x, y, blur, spread: CGFloat }

public struct UnitiThemedShadow {
    public let light: UnitiShadow
    public let dark: UnitiShadow
    public func resolved(for scheme: ColorScheme) -> UnitiShadow { scheme == .dark ? dark : light }
}

public struct UnitiTextStyle {
    public let family: String
    public let size: CGFloat
    public let weight: Font.Weight
    public let lineHeightMultiple: CGFloat
    /// Scales with Dynamic Type relative to the body style.
    public var font: Font { .custom(family, size: size, relativeTo: .body).weight(weight) }
    public var lineSpacing: CGFloat { size * (lineHeightMultiple - 1) }
}`;

/** SwiftUI constants for the Go Kinetic iOS app; colours carry both appearances. */
export function toSwift(themes: ThemeSet): string {
  const darkByPath = new Map(themes.dark.map((t) => [t.path.join('.'), t]));
  const lines = [`// ${GENERATED_HEADER}`, '', 'import SwiftUI', 'import UIKit', '', SUPPORT, '', 'public enum UnitiTokens {'];

  for (const { root, enumName } of SECTIONS) {
    const tokens = themes.light.filter((t) => t.path[0] === root);
    if (!tokens.length) continue;
    lines.push(`    public enum ${enumName} {`);
    for (const t of tokens) lines.push(`        ${declaration(t, darkByPath.get(t.path.join('.')))}`);
    lines.push('    }');
  }
  lines.push('}', '');
  return lines.join('\n');
}
