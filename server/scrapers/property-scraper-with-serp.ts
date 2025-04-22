import puppeteer from "puppeteer";
import axios from "axios";
import OpenAI from "openai";
import { PropertyAIData, PropertyScraperResult } from "@shared/types";
// if the host already has chrome / chromium
import { executablePath } from "puppeteer"; // v21+

const OPENAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const GOOGLE = process.env.SERPAPI_KEY!; // for the e‑mail lookup

export async function scrapePropertyListing(
  url: string,
): Promise<PropertyAIData> {
  await puppeteer.launch({ headless: true, executablePath: executablePath() });
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("body", { timeout: 5_000 });

    /* 1 ▸ raw HTML (trim to ~12 k to stay under token cap) */
    const html = (await page.content()).slice(0, 12_000);

    /* 2 ▸ let GPT‑4o‑mini extract the structure */
    const {
      choices: [c],
    } = await OPENAI.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert HTML parser. Extract and return ONLY JSON with:\n" +
            "address, price, beds, baths, sqft, yearBuilt,\n" +
            "agentName, agentPhone, agentCompany, agentLicense.",
        },
        { role: "user", content: html },
      ],
    });
    const ai = JSON.parse(c.message.content);

    /* 3 ▸ one Google query (SerpAPI) to pick an e‑mail address */
    let email = "";
    if (ai.agentName && ai.agentCompany) {
      const g = await axios.get("https://serpapi.com/search.json", {
        params: {
          engine: "google",
          q: `${ai.agentName} ${ai.agentCompany} email`,
          api_key: GOOGLE,
          num: 3,
        },
      });
      const snippet =
        g.data.organic_results?.[0]?.snippet ||
        g.data.answer_box?.snippet ||
        "";
      email = snippet.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? "";
    }

    /* 4 ▸ final object (fill gaps if GPT missed fields) */
    const result: PropertyScraperResult = {
      address: ai.address ?? "Address information unavailable",
      price: ai.price ?? "",
      beds: ai.beds ?? "",
      baths: ai.baths ?? "",
      sqft: ai.sqft ?? "",
      yearBuilt: ai.yearBuilt ?? "",
      imageUrls: [], // Puppeteer ⇒ no images
      listingAgentName: ai.agentName ?? "",
      listingAgentPhone: ai.agentPhone ?? "",
      listingAgentCompany: ai.agentCompany ?? "",
      listingAgentLicenseNo: ai.agentLicense ?? "",
      listingAgentEmail: email,
      propertyUrl: url,
    };

    return result as PropertyAIData;
  } catch (err) {
    console.error("Listing‑scrape error:", err);
    throw err;
  } finally {
    await browser.close();
  }
}
