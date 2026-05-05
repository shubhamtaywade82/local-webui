import { useCallback, useEffect, useRef, type DependencyList, type RefObject } from 'react';

function isNearBottom(el: HTMLElement, thresholdPx: number): boolean {
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

/**
 * Scrolls the list to the latest content only while the user stays near the bottom.
 * Lets you read earlier messages during streaming without being yanked down on every token.
 */
export function useStickToBottomScroll(
  scrollRef: RefObject<HTMLElement | null>,
  deps: DependencyList,
  thresholdPx = 120
) {
  const pinToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      pinToBottomRef.current = isNearBottom(el, thresholdPx);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, thresholdPx]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, deps);

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [scrollRef]);

  return { pinToBottom };
}
