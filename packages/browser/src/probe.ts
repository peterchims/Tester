/**
 * In-page responsiveness probe. Serialized and run via `page.evaluate` at each
 * viewport. Must be self-contained (no imports, no closures over module scope).
 */

export interface ProbeOffender {
  selector: string;
  tag: string;
  overflowRight: number;
  rect: { x: number; y: number; width: number; height: number };
  text?: string;
  reason: 'overflow' | 'fixed-wider-than-viewport' | 'clipped-text' | 'tiny-tap-target' | 'small-font';
}

export interface ProbeResult {
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  hasHorizontalOverflow: boolean;
  overflowPx: number;
  viewportMetaPresent: boolean;
  offenders: ProbeOffender[];
  tapTargetFailures: number;
  fontFailures: number;
  /** Sum of area (px^2) that sits outside the viewport width. */
  overflowArea: number;
}

export function runResponsiveProbe(): ProbeResult {
  const doc = document;
  const win = window;
  const vw = doc.documentElement.clientWidth;
  const vh = doc.documentElement.clientHeight;
  const tolerance = 2;

  const cssPath = (el: Element): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.nodeName.toLowerCase();
      if (node.classList.length > 0) {
        part += `.${Array.from(node.classList).slice(0, 2).map((c) => CSS.escape(c)).join('.')}`;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.nodeName === node!.nodeName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const isVisible = (el: Element, style: CSSStyleDeclaration, rect: DOMRect): boolean =>
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0 &&
    rect.width > 0 &&
    rect.height > 0;

  const offenders: ProbeOffender[] = [];
  const seen = new Set<Element>();
  let overflowArea = 0;
  let tapTargetFailures = 0;
  let fontFailures = 0;

  const all = Array.from(doc.body ? doc.body.querySelectorAll('*') : []);

  for (const el of all) {
    const style = win.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, style, rect)) continue;

    const tag = el.nodeName.toLowerCase();
    const textSample = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) || undefined;

    // --- horizontal overflow -------------------------------------------------
    const overflowRight = rect.right - vw;
    if (overflowRight > tolerance && rect.left < vw && !seen.has(el)) {
      // Only report the element if no visible ancestor already overflows by
      // roughly the same amount (report the outermost offender).
      const parent = el.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const parentOverflows = parentRect ? parentRect.right - vw > overflowRight - tolerance : false;
      if (!parentOverflows) {
        seen.add(el);
        offenders.push({
          selector: cssPath(el),
          tag,
          overflowRight: Math.round(overflowRight),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          text: textSample,
          reason: style.position === 'fixed' ? 'fixed-wider-than-viewport' : 'overflow',
        });
        overflowArea += Math.min(overflowRight, rect.width) * rect.height;
      }
    }

    // --- clipped text ------------------------------------------------------
    if (
      (style.overflow === 'hidden' || style.overflowX === 'hidden') &&
      style.textOverflow === 'ellipsis' &&
      el.scrollWidth - el.clientWidth > 4 &&
      textSample
    ) {
      offenders.push({
        selector: cssPath(el),
        tag,
        overflowRight: 0,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        text: textSample,
        reason: 'clipped-text',
      });
    }

    // --- tiny tap targets (mobile only, handled by caller via viewport size)
    const interactive =
      tag === 'a' || tag === 'button' || tag === 'select' || tag === 'input' || el.getAttribute('role') === 'button';
    if (interactive && vw <= 820) {
      const tooSmall = (rect.width < 40 || rect.height < 40) && !(tag === 'input' && (el as HTMLInputElement).type === 'hidden');
      if (tooSmall) {
        tapTargetFailures += 1;
        if (offenders.filter((o) => o.reason === 'tiny-tap-target').length < 15) {
          offenders.push({
            selector: cssPath(el),
            tag,
            overflowRight: 0,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            text: textSample,
            reason: 'tiny-tap-target',
          });
        }
      }
    }

    // --- font legibility --------------------------------------------------
    const fontPx = parseFloat(style.fontSize);
    if (vw <= 820 && textSample) {
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (fontPx < 16) fontFailures += 1;
      } else if (fontPx > 0 && fontPx < 12 && (el.childElementCount === 0)) {
        fontFailures += 1;
      }
    }
  }

  const docWidth = Math.max(
    doc.documentElement.scrollWidth,
    doc.body ? doc.body.scrollWidth : 0,
  );
  const docHeight = Math.max(
    doc.documentElement.scrollHeight,
    doc.body ? doc.body.scrollHeight : 0,
  );

  return {
    viewportWidth: vw,
    viewportHeight: vh,
    documentWidth: docWidth,
    documentHeight: docHeight,
    hasHorizontalOverflow: docWidth - vw > tolerance,
    overflowPx: Math.max(0, Math.round(docWidth - vw)),
    viewportMetaPresent: !!doc.querySelector('meta[name="viewport"]'),
    offenders: offenders.slice(0, 40),
    tapTargetFailures,
    fontFailures,
    overflowArea: Math.round(overflowArea),
  };
}
