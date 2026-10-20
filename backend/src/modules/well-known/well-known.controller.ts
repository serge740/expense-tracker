import { Controller, Get, Header } from '@nestjs/common';

@Controller('.well-known')
export class WellKnownController {
  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    const teamId = process.env.APPLE_TEAM_ID;
    const bundleId = process.env.APPLE_BUNDLE_ID;
    if (!teamId || !bundleId) return { webcredentials: { apps: [] } };
    return { webcredentials: { apps: [`${teamId}.${bundleId}`] } };
  }

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  assetlinks() {
    const packageName = process.env.ANDROID_PACKAGE_NAME;
    const fingerprints = (process.env.ANDROID_SHA256 ?? '')
      .split(',')
      .map(f => f.trim())
      .filter(Boolean);
    if (!packageName || !fingerprints.length) return [];
    return [
      {
        relation: ['delegate_permission/common.get_login_creds', 'delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
  }
}
