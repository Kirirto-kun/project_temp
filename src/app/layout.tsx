import type { Metadata } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/globals.css';

export const metadata:Metadata={title:'Holdline — Prepare your next conversation',description:'Meet your AI practice coach. Clarify your goal, prepare your opening, and practise a conversation that matters to you.',icons:{icon:'/intake/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
