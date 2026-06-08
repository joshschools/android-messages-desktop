import appIcon from '../../../resources/icons/512x512.png';
import { IS_DEV } from '../../constants';
import openAboutWindow from 'about-window';
import { app } from 'electron';
import packageJson from '../../../package.json';

const { description } = packageJson;

const productName = 'Android Messages Desktop';
const localeStyle = '-webkit-app-region: no-drag; position: absolute; left: 0.5em; bottom: 0.5em; font-size: 12px; color: #999';
const disclaimerText = '<br><br>Not affiliated with Google in any way.<br>Android is a trademark of Google LLC.';
const licenseText = `<br><br>${productName} is released under the MIT License.`;

let languageCode = '';
let descriptionWithLocale = '';
app.on('ready', () => {
    languageCode = app.getLocale();
    // about-window does not have a field for arbitrary HTML, so we add the HTML we need to an existing field
    descriptionWithLocale = `${description}<span style="${localeStyle}">${languageCode}</span>`;
});

export const aboutMenuItem = {
    label: `About ${productName}`,
    click: () => {
        openAboutWindow({
            icon_path: appIcon,
            copyright: `<div style="text-align: center">Copyright © 2018-2026 Chris Knepper, All rights reserved.${disclaimerText}${licenseText}</div>`,
            product_name: productName,
            description: descriptionWithLocale,
            open_devtools: IS_DEV,
            use_inner_html: true,
            win_options: {
                height: 500,
                resizable: false,
                minimizable: false,
                maximizable: false,
                show: false // Delays showing until content is ready, prevents FOUC/flash of blank white window
            }
        });
    }
};
