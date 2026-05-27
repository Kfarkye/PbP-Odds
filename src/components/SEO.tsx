import { useEffect } from 'react';

// In a real production deployment, this would be injected via process.env.VITE_CANONICAL_DOMAIN
// or similar to point to the prod domain (e.g., "https://aura.com").
const DOMAIN = window.location.origin;

interface SEOProps {
  title?: string;
  canonicalPath: string; // Should always start with '/', e.g., '/story/123'
}

export function SEO({ title, canonicalPath }: SEOProps) {
  useEffect(() => {
    if (title) {
      document.title = title;
    } else {
      document.title = 'Aura | Enterprise Sports Orchestration';
    }

    // Set canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    
    // Ensure all variant parameters (?category=nba) are stripped from canonicalPath 
    // to prevent duplicate indexing.
    const cleanPath = canonicalPath.split('?')[0];
    canonicalLink.setAttribute('href', `${DOMAIN}${cleanPath}`);
  }, [title, canonicalPath]);

  return null;
}
