import React, { useState } from 'react';
import { extractPropertyFromAnyUrl } from '../utils/clientScraper';
import type { PropertyAIData } from '../../../shared/types';

interface PropertyExtractorProps {
  onExtracted: (data: PropertyAIData) => void;
  onError: (error: string) => void;
  initialUrl?: string;
}

/**
 * PropertyExtractor component - Extracts property data from real estate URLs
 * Uses client-side scraping for Realtor.com to avoid server blocking
 */
export function PropertyExtractor({ onExtracted, onError, initialUrl = '' }: PropertyExtractorProps) {
  const [url, setUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [extractionMethod, setExtractionMethod] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!url) {
      onError('Please enter a property URL');
      return;
    }

    setIsLoading(true);
    setExtractionMethod(null);

    try {
      console.log('Extracting property data from URL:', url);
      
      // Use the client-side extraction function which tries multiple approaches
      const propertyData = await extractPropertyFromAnyUrl(url);
      
      // Store the extraction method for display
      setExtractionMethod(propertyData._extractionMethod || 'unknown');
      
      // Pass the extracted data to the parent component
      onExtracted(propertyData);
    } catch (error) {
      console.error('Property extraction error:', error);
      onError(error instanceof Error ? error.message : 'Failed to extract property data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-2">
        <label htmlFor="property-url" className="text-sm font-medium">
          Property URL
        </label>
        <div className="flex space-x-2">
          <input
            id="property-url"
            type="url"
            className="flex-1 px-3 py-2 border rounded-md"
            placeholder="https://www.zillow.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
          />
          <button
            className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            onClick={handleExtract}
            disabled={isLoading || !url}
          >
            {isLoading ? 'Extracting...' : 'Extract'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center p-4">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p>Extracting property data...</p>
          <p className="text-xs text-gray-500 mt-1">This may take a few seconds</p>
        </div>
      )}

      {extractionMethod && (
        <div className="text-xs bg-gray-100 p-2 rounded">
          <span className="font-medium">Extraction method:</span>{' '}
          {extractionMethod === 'client-side-direct' && 'Client-side (Realtor.com)'}
          {extractionMethod === 'client-side-via-realtor' && 'Client-side (via Realtor.com equivalent)'}
          {extractionMethod === 'client-side-failed' && 'Client-side extraction failed, fallback to server'}
          {extractionMethod === 'direct' && 'Server-side direct extraction'}
          {extractionMethod === 'serpapi+direct' && 'Server-side with SerpAPI'}
          {extractionMethod === 'url-analysis' && 'URL text analysis (fallback)'}
          {extractionMethod === 'failed' && 'Extraction failed'}
        </div>
      )}
    </div>
  );
}

/**
 * Displays extracted property data in a formatted card
 */
export function PropertyDataDisplay({ data }: { data: PropertyAIData }) {
  if (!data) return null;
  
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="p-4">
        <h3 className="text-lg font-semibold">{data.address}</h3>
        <p className="text-gray-600">
          {data.city}, {data.state} {data.zip}
        </p>
        
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Price</p>
            <p className="font-medium">${typeof data.price === 'number' ? data.price.toLocaleString() : data.price}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Beds</p>
            <p className="font-medium">{data.bedrooms}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Baths</p>
            <p className="font-medium">{data.bathrooms}</p>
          </div>
        </div>
        
        <div className="mt-4">
          <p className="text-sm text-gray-500">Square Feet</p>
          <p className="font-medium">{typeof data.squareFeet === 'number' ? data.squareFeet.toLocaleString() : data.squareFeet}</p>
        </div>
        
        {data.listingAgentName && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm text-gray-500">Listing Agent</p>
            <p className="font-medium">{data.listingAgentName}</p>
            {data.listingAgentCompany && <p className="text-sm">{data.listingAgentCompany}</p>}
            {data.listingAgentPhone && <p className="text-sm">Phone: {data.listingAgentPhone}</p>}
          </div>
        )}
        
        <div className="mt-4 text-xs text-gray-500">
          Source: {data.propertyUrl}
          {data._realtorUrl && (
            <div className="mt-1">
              Realtor.com URL: {data._realtorUrl}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}