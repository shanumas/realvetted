import React, { useState } from 'react';
import { PropertyExtractor, PropertyDataDisplay } from '../components/PropertyExtractor';
import type { PropertyAIData } from '../../../shared/types';

/**
 * Property Scraper Test Page
 * Demonstrates client-side scraping of property data from real estate websites
 * This approach avoids server-side scraping which gets blocked by Realtor.com
 * 
 * The entire extraction happens in the browser - we only use the server to
 * find Realtor.com equivalent URLs via SerpAPI.
 */
export function PropertyScraperTestPage() {
  const [propertyData, setPropertyData] = useState<PropertyAIData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtracted = (data: PropertyAIData) => {
    setPropertyData(data);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setPropertyData(null);
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Property Data Extractor</h1>
      
      <div className="bg-blue-50 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">About This Tool</h2>
        <p className="mb-2">
          This tool extracts property data from real estate websites like Zillow, Redfin, and Realtor.com.
        </p>
        <p className="mb-2">
          <strong>Client-side Scraping:</strong> For Realtor.com URLs, data is extracted directly in your browser to avoid IP-based blocking.
        </p>
        <p className="mb-2">
          <strong>Realtor.com Conversion:</strong> For other sites like Zillow, we use SerpAPI on the server to find the Realtor.com equivalent, then extract that in the browser.
        </p>
        <p>
          <strong>URL Analysis Fallback:</strong> If we can't find a Realtor.com equivalent, we extract basic address information from the URL structure itself.
        </p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <PropertyExtractor
          onExtracted={handleExtracted}
          onError={handleError}
        />
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      
      {propertyData && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Extracted Property Data</h2>
          <PropertyDataDisplay data={propertyData} />
        </div>
      )}
      
      <div className="mt-8 border-t pt-4 text-sm text-gray-500">
        <h3 className="font-medium text-gray-700 mb-2">Sample URLs to Try:</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <a 
              href="#" 
              className="text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('property-url')?.setAttribute(
                  'value',
                  'https://www.realtor.com/realestateandhomes-detail/1230-Page-St_San-Francisco_CA_94117_M18600-18071'
                );
                // Trigger a change event
                const event = new Event('input', { bubbles: true });
                document.getElementById('property-url')?.dispatchEvent(event);
              }}
            >
              Realtor.com (direct client-side extraction)
            </a>
          </li>
          <li>
            <a 
              href="#" 
              className="text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('property-url')?.setAttribute(
                  'value',
                  'https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/'
                );
                // Trigger a change event
                const event = new Event('input', { bubbles: true });
                document.getElementById('property-url')?.dispatchEvent(event);
              }}
            >
              Zillow (client-side via Realtor.com equivalent)
            </a>
          </li>
          <li>
            <a 
              href="#" 
              className="text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('property-url')?.setAttribute(
                  'value',
                  'https://www.redfin.com/CA/San-Francisco/1450-Post-St-94109/unit-907/home/49254099'
                );
                // Trigger a change event
                const event = new Event('input', { bubbles: true });
                document.getElementById('property-url')?.dispatchEvent(event);
              }}
            >
              Redfin (URL-structure fallback extraction)
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}