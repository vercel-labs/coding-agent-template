/**
 * Client-side logging interceptor for Vercel Sandbox
 * 
 * Add this script to your application to capture console logs and send them
 * to the parent window for display in the Client Logs tab.
 * 
 * Usage:
 * 1. Add this file to your project (e.g., public/sandbox-logger.js)
 * 2. Include it in your HTML: <script src="/sandbox-logger.js"></script>
 * 3. Logs will automatically be captured and sent to the parent window
 * 
 * For security, you can optionally specify the parent origin:
 * - Via query parameter: ?parentOrigin=https://example.com
 * - Via window variable: window.SANDBOX_LOGGER_PARENT_ORIGIN = 'https://example.com'
 */

(function () {
  // Check if we're in an iframe
  if (window.self === window.top) {
    return; // Not in an iframe, no need to intercept
  }

  // Store original console methods
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  // Determine the parent origin for secure postMessage
  let parentOrigin = '*'; // Default fallback
  
  // First, try to get parent origin from window variable (set by parent)
  if (window.SANDBOX_LOGGER_PARENT_ORIGIN) {
    parentOrigin = window.SANDBOX_LOGGER_PARENT_ORIGIN;
  } else {
    // Try to get from URL query parameter
    try {
      const params = new URLSearchParams(window.location.search);
      const queryOrigin = params.get('parentOrigin');
      if (queryOrigin) {
        // Validate it's a proper origin URL
        new URL(queryOrigin); // This will throw if invalid
        parentOrigin = queryOrigin;
      }
    } catch (e) {
      // Invalid origin format, will use fallback
    }
  }
  
  // Try to get parent origin from same-origin access (if available)
  if (parentOrigin === '*') {
    try {
      const parentUrl = new URL(window.parent.location.href);
      parentOrigin = parentUrl.origin;
    } catch (e) {
      // Parent is cross-origin, will use fallback '*'
    }
  }

  // Function to send log to parent
  function sendLogToParent(type, args) {
    try {
      const message = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      window.parent.postMessage(
        {
          type: 'sandbox-log',
          logType: type,
          message: message,
        },
        parentOrigin
      );
    } catch (error) {
      // Silently fail if we can't send the message
      originalConsole.error('Failed to send log to parent:', error);
    }
  }

  // Override console methods
  console.log = function (...args) {
    originalConsole.log.apply(console, args);
    sendLogToParent('log', args);
  };

  console.error = function (...args) {
    originalConsole.error.apply(console, args);
    sendLogToParent('error', args);
  };

  console.warn = function (...args) {
    originalConsole.warn.apply(console, args);
    sendLogToParent('warn', args);
  };

  console.info = function (...args) {
    originalConsole.info.apply(console, args);
    sendLogToParent('info', args);
  };

  // Capture uncaught errors
  window.addEventListener('error', function (event) {
    sendLogToParent('error', [
      `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
    ]);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    sendLogToParent('error', [`Unhandled Promise Rejection: ${event.reason}`]);
  });

  // Send initial message to indicate logger is loaded
  sendLogToParent('info', ['Sandbox logger initialized']);
})();
