/** What kind of device and browser this is, for the install help (iPhones and iPads have no one-tap install). */

/**
 * iPhone, iPad or iPod. Since iPadOS 13 an iPad's Safari says it is a Mac, so a "Mac" with a touch screen is an iPad.
 * The inputs are parameters so tests can try each case.
 */
export function isIosDevice(ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

/**
 * A browser built into another app (Facebook, Instagram, TikTok, LinkedIn, Snapchat, Line, WeChat, Gmail...). These have no
 * Share menu with "Add to Home Screen", so the page has to be opened in Safari first.
 */
export function isInAppBrowser(ua: string = navigator.userAgent): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Snapchat|Line\/|MicroMessenger|GSA\/|Twitter/i.test(ua);
}
