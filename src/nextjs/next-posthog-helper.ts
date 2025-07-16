/**
 * PostHog universal helper
 * 
 * This helper abstracts PostHog interactions for both client and server environments.
 * It automatically detects the runtime context and uses the appropriate PostHog library.
 * 
 * Usage:
 * - Import and use the same functions in both client and server code
 * - No need to worry about which PostHog library to use
 * - Server-side events are automatically flushed using Next.js after()
 */

// Import both PostHog libraries
// @ts-ignore - These imports are resolved based on the build context
import { posthog as posthogJS } from 'posthog-js'
// @ts-ignore
import { PostHog as PostHogNode } from 'posthog-node'
// @ts-ignore
import { after } from 'next/server'

// Keep a singleton instance for server-side PostHog
let serverPostHog: any = null

/**
 * Get or create the server-side PostHog instance
 * We keep a singleton to avoid creating multiple instances
 */
function getServerPostHog() {
  if (!serverPostHog && typeof window === 'undefined') {
    serverPostHog = new PostHogNode(
      process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
      {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        flushAt: 20,       // Batch up to 20 events
        flushInterval: 30000 // Flush every 30 seconds
      }
    )
  }
  return serverPostHog
}

/**
 * Capture an analytics event
 * 
 * @param eventName - The name of the event (e.g., 'button-clicked', 'form-submitted')
 * @param properties - Optional properties to attach to the event
 * 
 * @example
 * // Client-side usage
 * captureEvent('button-clicked', { buttonName: 'signup', location: 'header' })
 * 
 * // Server-side usage (in API routes or server actions)
 * captureEvent('api-called', { endpoint: '/api/users', method: 'POST' })
 */
export function captureEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  try {
    if (typeof window !== 'undefined') {
      // Client-side: use posthog-js
      // Assumes PostHog is already initialized via instrumentation-client
      posthogJS.capture(eventName, properties)
    } else {
      // Server-side: use posthog-node
      const ph = getServerPostHog()
      if (ph) {
        after(() => ph.flush())
        
        ph.capture({
          distinctId: properties?.$distinct_id || 'anonymous',
          event: eventName,
          properties: properties || {}
        })
      }
    }
  } catch (error) {
    // Fail silently to not break the application
    console.error('[PostHog helper] Error capturing event:', error)
  }
}

/**
 * Identify a user for analytics tracking
 * 
 * @param userId - The unique identifier for the user
 * @param properties - Optional user properties (email, name, etc.)
 * 
 * @example
 * // After user signs in
 * postHogIdentify(user.id, {
 *   email: user.email,
 *   name: user.name,
 *   plan: 'premium'
 * })
 */
export function postHogIdentify(
  userId: string,
  properties?: Record<string, any>
): void {
  try {
    if (typeof window !== 'undefined') {
      // Client-side: use posthog-js
      posthogJS.identify(userId, properties)
    } else {
      // Server-side: use posthog-node
      const ph = getServerPostHog()
      if (ph) {
        after(() => ph.flush())
        
        ph.identify({
          distinctId: userId,
          properties: properties || {}
        })
      }
    }
  } catch (error) {
    // Fail silently to not break the application
    console.error('[PostHog helper] Error identifying user:', error)
  }
}

// For JavaScript projects that might not have proper TypeScript types
export default {
  captureEvent,
  postHogIdentify
}