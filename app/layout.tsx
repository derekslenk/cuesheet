import './globals.css';

export const metadata = {
  title: 'OBS Source Switcher',
  description: 'A tool to manage OBS sources dynamically',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}