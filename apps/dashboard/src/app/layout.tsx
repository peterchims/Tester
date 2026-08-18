import type {Metadata} from 'next';import './styles.css';
export const metadata:Metadata={title:'Northstar Quality',description:'Product quality control plane'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
