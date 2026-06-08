const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization unless Apple credentials are present in the environment.
  const appleId = process.env.ANDROID_MESSAGES_APPLE_ID_EMAIL;
  const appleIdPassword = process.env.ANDROID_MESSAGES_APPLE_ID_APP_PASSWORD;
  const teamId = process.env.ANDROID_MESSAGES_APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping notarization: Apple credentials are not set.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'com.knepper.android-messages-desktop',
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword,
    teamId,
  });
};
