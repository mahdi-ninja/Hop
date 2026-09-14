import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { DownloadIcon } from './icons';
import { Button, Card, CardTitle } from './ui';

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

export function QrCode({ url, name }: { url: string; name: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1d2a24', light: '#ffffff' } }).then(
      (markup) => !cancelled && setSvg(markup),
      () => !cancelled && setSvg(null),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const downloadSvg = () => {
    if (!svg) return;
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    download(href, `${name}.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const downloadPng = async () => {
    download(await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' }), `${name}.png`);
  };

  return (
    <Card className="flex flex-col items-center">
      <div className="self-stretch">
        <CardTitle>QR code</CardTitle>
      </div>
      {/* The QR is always dark-on-white so it stays scannable in dark mode. */}
      <div
        className="w-44 rounded-2xl bg-white p-3 ring-1 ring-line [&>svg]:h-auto [&>svg]:w-full"
        role="img"
        aria-label={`QR code for ${url}`}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={downloadSvg} disabled={!svg}>
          <DownloadIcon /> SVG
        </Button>
        <Button size="sm" onClick={() => void downloadPng()}>
          <DownloadIcon /> PNG
        </Button>
      </div>
    </Card>
  );
}
