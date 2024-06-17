"use client"
import { useState, useEffect } from 'react';

type dimensionsType = {
    width:number | null
    height:number | null
}
export function useScreenSize() {
  const [dimensions, setDimensions] = useState<dimensionsType>({ width: null, height: null });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      }

      window.addEventListener('resize', handleResize);
      handleResize();
      
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  return {
    ...dimensions,
    sm:dimensions.width ? dimensions.width < 640 : null,
    md:dimensions.width ? dimensions.width < 768 : null,
    lg:dimensions.width ? dimensions.width < 1024 : null,
    xl:dimensions.width ? dimensions.width < 1280 : null,
  };
}