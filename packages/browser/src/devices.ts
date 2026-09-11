import type { DeviceType } from '@techtester/contracts';

export interface ViewportProfile {
  label: string;
  width: number;
  height: number;
  dpr: number;
  deviceType: DeviceType;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/** The full device matrix, mirroring the browser devtools device toolbar. */
export const VIEWPORT_MATRIX: ViewportProfile[] = [
  { label: 'Small phone', width: 320, height: 568, dpr: 2, deviceType: 'mobile', isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { label: 'iPhone 13/14', width: 390, height: 844, dpr: 3, deviceType: 'mobile', isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { label: 'Pixel 7', width: 412, height: 915, dpr: 2.625, deviceType: 'mobile', isMobile: true, hasTouch: true, userAgent: ANDROID_UA },
  { label: 'Large phone', width: 414, height: 896, dpr: 3, deviceType: 'mobile', isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { label: 'Tablet portrait', width: 768, height: 1024, dpr: 2, deviceType: 'tablet', isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { label: 'Tablet landscape', width: 1024, height: 768, dpr: 2, deviceType: 'tablet', isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { label: 'Laptop', width: 1366, height: 768, dpr: 1, deviceType: 'desktop', isMobile: false, hasTouch: false },
  { label: 'Desktop', width: 1440, height: 900, dpr: 1, deviceType: 'desktop', isMobile: false, hasTouch: false },
  { label: 'Full HD', width: 1920, height: 1080, dpr: 1, deviceType: 'desktop', isMobile: false, hasTouch: false },
  { label: 'QHD / 4K-class', width: 2560, height: 1440, dpr: 1, deviceType: 'desktop', isMobile: false, hasTouch: false },
];

export const BASE_DESKTOP: ViewportProfile = VIEWPORT_MATRIX.find((v) => v.label === 'Desktop')!;

export function selectViewports(group: 'all' | 'mobile' | 'desktop'): ViewportProfile[] {
  if (group === 'mobile') return VIEWPORT_MATRIX.filter((v) => v.deviceType !== 'desktop');
  if (group === 'desktop') return VIEWPORT_MATRIX.filter((v) => v.deviceType === 'desktop');
  return VIEWPORT_MATRIX;
}
