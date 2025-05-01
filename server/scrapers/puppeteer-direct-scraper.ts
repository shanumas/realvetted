/**
 * extract‑property.ts
 *
 * One‑step utility that:
 *   1. Opens the listing URL in a headless Chrome instance
 *   2. Pulls the obvious facts (address, price, beds, baths, etc.)
 *   3. Reads the “Listed by” name, Googles it, opens the first result,
 *      and scrapes the first e‑mail address it finds
 */

import { Browser, Page } from "puppeteer-core";
import * as cheerio from "cheerio";
import { PropertyAIData } from "@shared/types";
import _ from "lodash";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import OpenAI from "openai";
import axios from "axios";

/** ------------ main exported function with enhanced anti-detection and CAPTCHA handling ------------ */
export async function extractPropertyWithPuppeteer(
  originalUrl: string,
  description: string,
): Promise<PropertyAIData> {
  puppeteer.use(StealthPlugin());
  const browser = await launchBrowser(); // Use the launchBrowser function instead
  try {
    /*     url =
      "https://www.compass.com/listing/1257-fulton-street-san-francisco-ca-94117/1775115899818324705/"; */
    console.log("🌐 Extracting property data from Description:", description);

    let data: PropertyAIData;

    if (description) {
      data = await extractAgentDataWithGPT(description);
    } else {
      console.log("Description is empty");
      data = EMPTY_PROPERTY;
    }

    console.log("Complete data " + JSON.stringify(data));
    data.propertyUrl = originalUrl;

    if (description) {
      const { email, phone } = await findAgentEmail(description);
      //Fallback email is Uma's email
      if (email) {
        data.listingAgentEmail = email;
      } else {
        data.listingAgentEmail =
          process.env.LISTING_AGENT_FALLBACK ?? "shanumas@gmail.com";
      }
      //Fallback phone is Randy's phone
      if (phone) {
        data.listingAgentPhone = phone;
      } else {
        data.listingAgentPhone =
          process.env.LISTING_AGENT_FALLBACK_PHONE ?? "(828) 678-0070";
      }
      //RIP
      console.log("-----Extracted Email: " + email);
    }

    console.log("Complete data " + JSON.stringify(data));

    return data;
  } catch (err) {
    console.error("❌ extractPropertyWithPuppeteer failed:", err);
    return { ...EMPTY_PROPERTY, propertyUrl: originalUrl };
  } finally {
    await browser.close();
  }
}

export async function extractAgentDataWithGPT(
  description: string,
): Promise<PropertyAIData> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `
You are a real estate data extractor. Extract the listing agent details from this HTML content inside a <main> tag.

Extract the following fields as JSON:
- address
- price - Total asking (sale) price, never monthly cost.
- bedrooms
- bathrooms
- listingAgentName
- listingAgentPhone
- listingAgentLicenseNo
- listingAgentCompany

If a field is missing, return it as an empty string.

HTML:
"""${description}"""
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  const jsonStart = res.choices[0].message.content?.indexOf("{") ?? -1;
  const jsonString = res.choices[0].message.content?.slice(jsonStart);

  console.log("Return string from openai: " + jsonString);

  try {
    const match = jsonString?.match(/{[\s\S]+}/);
    const clean = match ? match[0] : "{}";
    const parsedData = JSON.parse(clean);
    console.log("Parsed data: " + parsedData);
    return parsedData;
  } catch {
    return {
      address: "",
      price: "",
      bedrooms: "",
      bathrooms: "",
      listingAgentName: "",
      listingAgentPhone: "",
    };
  }
}

/* ==================================================
 *             ── helpers below ──
 * ================================================== */

const EMPTY_PROPERTY: PropertyAIData = {
  address: "Address unavailable",
  bedrooms: "",
  bathrooms: "",
  price: "",
  description: "",
  listingAgentName: "",
  listingAgentPhone: "",
  listingAgentEmail: "",
  listingAgentCompany: "",
  listingAgentLicenseNo: "",
  propertyUrl: "",
};

/* ---------- launch Chrome with enhanced stealth mode ---------- */
async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true, // Use headless mode for replit environment
    executablePath:
      "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security", // Disable same-origin policy
      "--disable-features=IsolateOrigins",
      "--disable-automation", // Hide automation flags
      "--disable-blink-features=AutomationControlled", // Critical for avoiding detection
      "--window-size=1920,1080",
      "--start-maximized", // Start with a maximized window to look like a real user
      "--disable-extensions", // Disable extensions to avoid detection
      "--hide-scrollbars", // Hide scrollbars to appear more human
      "--mute-audio", // Mute audio to avoid unexpected sounds
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 5) + 120}.0.0.0 Safari/537.36`,
    ],
    ignoreDefaultArgs: ["--enable-automation"], // Avoid automation flags
    defaultViewport: null, // Use window size instead of viewport
  });
}

/* ---------- Advanced stealth page prep with evasion techniques ---------- */
async function prepPage(page: Page) {
  // Randomize Chrome version to appear as different browsers
  const chromeVersion = Math.floor(Math.random() * 5) + 120;
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;

  await page.setUserAgent(userAgent);

  // Set a realistic viewport and device scale factor
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false,
  });

  // Set cookies to appear as a returning visitor
  await page.setCookie({
    name: "returning_visitor",
    value: "true",
    domain: ".zillow.com",
    expires: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
    httpOnly: false,
    secure: true,
    sameSite: "None",
  });

  // Set headers that make the request appear more realistic
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Sec-CH-UA": `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not-A.Brand";v="99"`,
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
  });

  // Inject scripts to modify the browser environment and evade detection
  await page.evaluateOnNewDocument(() => {
    // ----- 1. Make navigator properties consistent with our user agent -----
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "language", { get: () => "en-US" });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en", "es"],
    });

    // ----- 2. Create convincing plugins array -----
    const plugins = [
      {
        name: "Chrome PDF Plugin",
        filename: "internal-pdf-viewer",
        description: "Portable Document Format",
        mimeTypes: [{ type: "application/pdf", suffixes: "pdf" }],
      },
      {
        name: "Chrome PDF Viewer",
        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
        description: "",
        mimeTypes: [{ type: "application/pdf", suffixes: "pdf" }],
      },
      {
        name: "Native Client",
        filename: "internal-nacl-plugin",
        description: "",
        mimeTypes: [
          { type: "application/x-nacl", suffixes: "nacl" },
          { type: "application/x-pnacl", suffixes: "pnacl" },
        ],
      },
    ];

    // Define plugins property to return our fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const pluginArray = plugins.map((plugin) => {
          const mimeTypes = plugin.mimeTypes.map((mt) => {
            return { type: mt.type, suffixes: mt.suffixes, description: "" };
          });

          return {
            name: plugin.name,
            filename: plugin.filename,
            description: plugin.description,
            length: mimeTypes.length,
            item: (index: number) => mimeTypes[index],
            namedItem: (name: string) =>
              mimeTypes.find((mt) => mt.type === name),
          };
        });

        // Make the array iterable
        pluginArray.item = (index: number) => pluginArray[index];
        pluginArray.namedItem = (name: string) =>
          pluginArray.find((p) => p.name === name);
        pluginArray.refresh = () => {};

        return Object.defineProperty(pluginArray, "length", {
          value: pluginArray.length,
        });
      },
    });

    // ----- 3. Remove automation-specific attributes -----

    // Spoof screen dimensions to match viewport
    Object.defineProperty(window.screen, "width", { get: () => 1920 });
    Object.defineProperty(window.screen, "height", { get: () => 1080 });
    Object.defineProperty(window.screen, "availWidth", { get: () => 1920 });
    Object.defineProperty(window.screen, "availHeight", { get: () => 1040 });
    Object.defineProperty(window.screen, "colorDepth", { get: () => 24 });
    Object.defineProperty(window.screen, "pixelDepth", { get: () => 24 });

    // ----- 4. Mock user interaction functions -----
    const originalQuerySelector = document.querySelector;
    document.querySelector = function (...args) {
      // Add a slight delay to querySelector to appear more human
      const start = Date.now();
      while (Date.now() - start < 5) {} // Small delay
      return originalQuerySelector.apply(this, args);
    };

    // ----- 5. Fake WebGL to match real browsers -----
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      // Spoof renderer info
      if (parameter === 37445) {
        return "Google Inc. (NVIDIA)";
      }
      if (parameter === 37446) {
        return "ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)";
      }

      return getParameter.apply(this, [parameter]);
    };

    // ----- 6. Add generic browser features -----

    // Add notification API
    if (!("Notification" in window)) {
      window.Notification = {
        permission: "default",
        requestPermission: async () => "default",
      };
    }

    // ----- 7. Hide automation flags -----
    // Remove flag used by CloudFlare and others
    delete (window as any)._phantom;
    delete (window as any).__nightmare;
    delete (window as any).callPhantom;

    // Add regular Chrome functions
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: {
          DISABLED: "disabled",
          INSTALLED: "installed",
          NOT_INSTALLED: "not_installed",
        },
        RunningState: {
          CANNOT_RUN: "cannot_run",
          READY_TO_RUN: "ready_to_run",
          RUNNING: "running",
        },
      },
      runtime: {
        OnInstalledReason: {
          CHROME_UPDATE: "chrome_update",
          INSTALL: "install",
          SHARED_MODULE_UPDATE: "shared_module_update",
          UPDATE: "update",
        },
        OnRestartRequiredReason: {
          APP_UPDATE: "app_update",
          OS_UPDATE: "os_update",
          PERIODIC: "periodic",
        },
        PlatformArch: {
          ARM: "arm",
          ARM64: "arm64",
          MIPS: "mips",
          MIPS64: "mips64",
          X86_32: "x86-32",
          X86_64: "x86-64",
        },
        PlatformNaclArch: {
          ARM: "arm",
          MIPS: "mips",
          MIPS64: "mips64",
          X86_32: "x86-32",
          X86_64: "x86-64",
        },
        PlatformOs: {
          ANDROID: "android",
          CROS: "cros",
          LINUX: "linux",
          MAC: "mac",
          OPENBSD: "openbsd",
          WIN: "win",
        },
        RequestUpdateCheckStatus: {
          NO_UPDATE: "no_update",
          THROTTLED: "throttled",
          UPDATE_AVAILABLE: "update_available",
        },
      },
    };

    // Mock permissions API used by newer sites
    if (!("permissions" in navigator)) {
      (navigator as any).permissions = {
        query: async () => ({ state: "prompt", onchange: null }),
      };
    }
  });
}

export async function findAgentEmail(
  allDetails: string,
): Promise<{ email: string; phone: string }> {
  try {
    const realtorDetailsOnly = (
      allDetails.match(/Listed by\s*([\s\S]*?)(?=Listed by|$)/i)?.[1] || ""
    ).trim();

    console.log("------🔍 Searching for agent email in:", realtorDetailsOnly);
    const searchQuery = `${realtorDetailsOnly} realtor email`;

    const serpRes = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: searchQuery,
        api_key: process.env.SERPAPI_KEY,
        engine: "google",
        num: 2,
      },
    });

    const results = serpRes.data.organic_results || [];
    console.log(
      "------🔍 Search results from email search query:",
      JSON.stringify(results),
    );

    let phone = "";
    for (const result of results.slice(0, 2)) {
      try {
        const text = result.snippet || "";
        console.log("🔍 Searching for email in: " + text);
        const match = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
        const phoneMatch = text.match(
          /(?:\+?1\s*[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/,
        );
        if (phoneMatch) phone = phoneMatch[0];
        if (match) return { email: match[0], phone };
      } catch (err) {
        console.warn(`❌ Failed to fetch or parse ${result.link}:`, err);
      }
    }

    return { email: "", phone };
  } catch (err) {
    console.error("🔴 SerpAPI email lookup failed:", err);
    return { email: "", phone: "" };
  }
}
