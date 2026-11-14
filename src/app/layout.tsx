import type { Metadata } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/globals.css';

export const metadata:Metadata={title:'Holdline — Prepare your next money conversation',description:'Meet your AI practice coach. Prepare a clearer ask, check your numbers, and practise your next money conversation.',icons:{icon:'/intake/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
