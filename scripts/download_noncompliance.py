#!/usr/bin/env python3
"""
Download NASDAQ noncompliance data and save as noncompliance.csv.

Tries two methods in order:
  1. HTTP requests with browser-like headers (fast)
  2. Playwright browser automation (more reliable, used as fallback)
"""

import csv
import json
import sys

import requests

OUTPUT_FILE = "noncompliance.csv"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# Column names the website expects
CSV_COLUMNS = ["Symbol", "Issuer Name", "Market", "Deficiency", "Notification Date"]

# Map from possible API field names to the expected CSV column names
FIELD_MAP = {
    "symbol": "Symbol",
    "Symbol": "Symbol",
    "issuerName": "Issuer Name",
    "issuer_name": "Issuer Name",
    "companyName": "Issuer Name",
    "company": "Issuer Name",
    "market": "Market",
    "Market": "Market",
    "deficiency": "Deficiency",
    "Deficiency": "Deficiency",
    "deficiencyType": "Deficiency",
    "notificationDate": "Notification Date",
    "notification_date": "Notification Date",
    "Notification Date": "Notification Date",
    "dateNotified": "Notification Date",
}


def try_requests_download():
    """Try downloading via HTTP requests with browser-like headers."""
    session = requests.Session()

    # Visit main page first to pick up session cookies
    print("Visiting NASDAQ page to get session...")
    try:
        session.get(
            "https://www.nasdaq.com/market-activity/stocks/non-compliant-company-list",
            headers={
                **BROWSER_HEADERS,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            timeout=20,
        )
    except Exception as e:
        print(f"  Could not visit main page: {e}")

    print("Requesting NASDAQ API...")
    try:
        response = session.get(
            "https://api.nasdaq.com/api/compliance/non-compliant-company-list",
            params={"tableonly": "true", "limit": "25", "offset": "0", "download": "true"},
            headers={
                **BROWSER_HEADERS,
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.nasdaq.com/",
            },
            timeout=20,
        )
    except Exception as e:
        print(f"  Request failed: {e}")
        return False

    print(f"  Status: {response.status_code}")
    if response.status_code != 200:
        return False

    content_type = response.headers.get("content-type", "")
    print(f"  Content-Type: {content_type}")

    # If NASDAQ returns a raw CSV, save it directly
    if "csv" in content_type or "text/plain" in content_type:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(response.text)
        print(f"  Saved CSV directly ({len(response.text)} bytes)")
        return True

    # Otherwise try to parse JSON
    try:
        data = response.json()
    except Exception as e:
        print(f"  Could not parse JSON: {e}")
        return False

    print(f"  JSON top-level keys: {list(data.keys())}")
    rows = extract_rows(data)
    if rows:
        save_rows(rows)
        return True

    print("  Could not find row data in JSON response")
    return False


def extract_rows(data):
    """Extract row list from various NASDAQ JSON response shapes."""
    # Common shape: { data: { table: { rows: [...] } } }
    if "data" in data:
        inner = data["data"]
        if isinstance(inner, dict) and "table" in inner:
            rows = inner["table"].get("rows", [])
            if rows:
                print(f"  Found {len(rows)} rows in data.table.rows")
                return rows
        if isinstance(inner, list) and inner:
            print(f"  Found {len(inner)} rows in data[]")
            return inner
    if "rows" in data and data["rows"]:
        print(f"  Found {len(data['rows'])} rows in rows[]")
        return data["rows"]
    return []


def save_rows(rows):
    """Save extracted rows to CSV using the expected column names."""
    print(f"  First row sample: {rows[0]}")
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            mapped = {}
            for src, dst in FIELD_MAP.items():
                if src in row and dst not in mapped:
                    mapped[dst] = row[src]
            writer.writerow(mapped)
    print(f"  Saved {len(rows)} rows to {OUTPUT_FILE}")


def try_playwright_download():
    """
    Fallback: launch a real browser to find and click the CSV download button.
    This works even when the API is blocked, because it behaves like a real user.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  Playwright not installed, skipping")
        return False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=BROWSER_HEADERS["User-Agent"],
            accept_downloads=True,
        )
        page = context.new_page()

        url = "https://listingcenter.nasdaq.com/noncompliantcompanylist.aspx"
        print(f"  Opening {url} ...")
        try:
            page.goto(url, timeout=30000, wait_until="networkidle")
        except Exception as e:
            print(f"  Page load error: {e}")
            browser.close()
            return False

        print(f"  Page title: {page.title()}")

        # Selectors to try for the download button, in order of likelihood
        selectors = [
            "text=Download",
            "text=Export to CSV",
            "text=Export CSV",
            "text=Download CSV",
            "button:has-text('Download')",
            "a:has-text('Download')",
            "button:has-text('CSV')",
            "a:has-text('CSV')",
            "[title*='Download']",
            "[title*='Export']",
            "input[value*='Download']",
        ]

        for selector in selectors:
            try:
                if page.locator(selector).count() == 0:
                    continue
                print(f"  Trying selector: {selector}")
                with page.expect_download(timeout=15000) as dl_info:
                    page.click(selector, timeout=5000)
                dl = dl_info.value
                dl.save_as(OUTPUT_FILE)
                print(f"  Downloaded! (selector: {selector})")
                browser.close()
                return True
            except Exception as e:
                print(f"    Failed: {e}")

        # Log buttons found so user can debug if needed
        print("\n  Buttons/links found on page (for debugging):")
        for el in page.locator("button, a").all()[:25]:
            print(f"    '{el.inner_text()[:60].strip()}'")

        browser.close()
        return False


if __name__ == "__main__":
    print("=== NASDAQ Noncompliance Downloader ===\n")

    print("Method 1: HTTP requests")
    if try_requests_download():
        print(f"\nSuccess! Data saved to {OUTPUT_FILE}")
        sys.exit(0)

    print("\nMethod 1 failed. Trying Method 2: Playwright browser...\n")
    if try_playwright_download():
        print(f"\nSuccess! Data saved to {OUTPUT_FILE}")
        sys.exit(0)

    print("\nBoth methods failed. See output above for debugging info.")
    print("You may need to update the download URL or button selector.")
    sys.exit(1)
