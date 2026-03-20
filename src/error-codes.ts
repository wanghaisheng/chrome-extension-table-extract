export enum ErrorCodes {
    GOOGLE_CHROME_INTERNAL_PAGES,
    FILE_URLS_NOT_ALLOWED,
    SCRIPT_INJECTION_FAILED
  }
  
  export const ERROR_MESSAGES = new Map<ErrorCodes, string>(
    [
      [ErrorCodes.GOOGLE_CHROME_INTERNAL_PAGES, "Open a page with a table, then try again!"],
      [ErrorCodes.FILE_URLS_NOT_ALLOWED, "This page is a local file (file://). Enable “Allow access to file URLs” for this extension in chrome://extensions, or serve the file via http(s) and try again."],
      [ErrorCodes.SCRIPT_INJECTION_FAILED, "Failed to inject the scraper into the current tab. Try reloading the page and ensure the extension has permission to access it."]
    ]
  );
 
