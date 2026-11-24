import Svg, { Circle, Path } from "react-native-svg";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function Glyph({ d, size = 16, color = "#8E8E98", strokeWidth = 1.75 }: IconProps & { d: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HatchMark({ size = 22 }: { size?: number }) {
  const height = (size * 18) / 24;
  return (
    <Svg width={size} height={height} viewBox="0 0 24 18" fill="none">
      <Path d="M3.2 6.1 L8.4 2.2" stroke="#84B6FF" strokeWidth={1.7} strokeLinecap="round" />
      <Path
        d="M9.2 5.4 H18.6 A2.6 2.6 0 0 1 21.2 8 V12.6 A2.6 2.6 0 0 1 18.6 15.2 H5.6 A2.6 2.6 0 0 1 3 12.6 V8 A2.6 2.6 0 0 1 5.6 5.4"
        stroke="#FAFAFA"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M6.4 9.5 H15.2" stroke="#84B6FF" strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function IconHome(props: IconProps) {
  return <Glyph {...props} d="M4 10.5 L12 4 L20 10.5 V19 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 Z" />;
}

export function IconAgents(props: IconProps) {
  return <Glyph {...props} d="M12 12 a3.2 3.2 0 1 0 0 -6.4 a3.2 3.2 0 0 0 0 6.4 M5.5 19.2 v-.6 a4.2 4.2 0 0 1 4.2 -4.2 h4.6 a4.2 4.2 0 0 1 4.2 4.2 v.6" />;
}

export function IconFiles(props: IconProps) {
  return <Glyph {...props} d="M4 7.5 A2 2 0 0 1 6 5.5 H10 L12 8 H18 a2 2 0 0 1 2 2 V17 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 Z" />;
}

export function IconMic(props: IconProps) {
  return <Glyph {...props} d="M12 4.5 a2.6 2.6 0 0 1 2.6 2.6 V11 a2.6 2.6 0 0 1 -5.2 0 V7.1 A2.6 2.6 0 0 1 12 4.5 M8 11.2 a4 4 0 0 0 8 0 M12 15.2 V19" />;
}

export function IconPlus(props: IconProps) {
  return <Glyph {...props} d="M12 5.5 V18.5 M5.5 12 H18.5" />;
}

export function IconSearch(props: IconProps) {
  return <Glyph {...props} d="M11 17 a6 6 0 1 0 0 -12 a6 6 0 0 0 0 12 M16.2 16.2 L20 20" />;
}

export function IconChevron(props: IconProps) {
  return <Glyph {...props} d="M9 6 L15 12 L9 18" />;
}

export function IconBack(props: IconProps) {
  return <Glyph {...props} d="M15 6 L9 12 L15 18" />;
}

export function IconArrowUp(props: IconProps) {
  return <Glyph {...props} d="M12 18 V6.5 M7 11 L12 6 L17 11" />;
}

export function IconLock(props: IconProps) {
  return <Glyph {...props} strokeWidth={props.strokeWidth ?? 1.8} d="M8 11 V8.2 a4 4 0 0 1 8 0 V11 M7 11 H17 V19 H7 Z" />;
}

export function IconClose(props: IconProps) {
  return <Glyph {...props} d="M7 7 L17 17 M17 7 L7 17" />;
}

export function IconPhoto(props: IconProps) {
  return <Glyph {...props} d="M5 6 H19 A2 2 0 0 1 21 8 V18 A2 2 0 0 1 19 20 H5 A2 2 0 0 1 3 18 V8 A2 2 0 0 1 5 6 M8 11 a1.4 1.4 0 1 0 0.01 0 M21 15 L16 11 L6 20" />;
}

export function IconCamera(props: IconProps) {
  return <Glyph {...props} d="M4 8 H8 L10 6 H14 L16 8 H20 A1 1 0 0 1 21 9 V18 A1 1 0 0 1 20 19 H4 A1 1 0 0 1 3 18 V9 A1 1 0 0 1 4 8 M12 16 a3 3 0 1 0 0 -6 a3 3 0 0 0 0 6" />;
}

export function IconGrid(props: IconProps) {
  return <Glyph {...props} d="M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z" />;
}

export function IconDots({ size = 16, color = "#8E8E98" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx="6" cy="12" r="1.6" />
      <Circle cx="12" cy="12" r="1.6" />
      <Circle cx="18" cy="12" r="1.6" />
    </Svg>
  );
}

export function roleIcon(id: string | undefined, props: IconProps) {
  if (id === "scale") return <Glyph {...props} d="M12 4 V20 M7 20 H17 M12 7 L6.5 13 H4 M12 7 L17.5 13 H20 M6.5 13 a2.2 2.2 0 1 0 0 0.1 M17.5 13 a2.2 2.2 0 1 0 0 0.1" />;
  if (id === "layers") return <Glyph {...props} d="M12 4 L20 8 L12 12 L4 8 Z M4 12 L12 16 L20 12 M4 16 L12 20 L20 16" />;
  if (id === "trending-up") return <Glyph {...props} d="M4 16 L9 11 L13 14 L20 7 M15 7 H20 V12" />;
  if (id === "brackets") return <Glyph {...props} d="M8 7 L5 12 L8 17 M16 7 L19 12 L16 17" />;
  return <Glyph {...props} d="M6 8 H18 V18 H6 Z M9 8 V6 H15 V8" />;
}
