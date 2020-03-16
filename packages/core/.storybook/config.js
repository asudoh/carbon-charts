import { configure } from "@storybook/html";
import addons from '@storybook/addons';
import { setOptions } from "@storybook/addon-options";
import { CURRENT_THEME } from './addon-carbon-theme/shared';
import theme from './theme';

setOptions({
  name: "Carbon Charts - Vanilla",
  showAddonPanel: true,
  sortStoriesByKind: true,
  panelPosition: 'bottom',
  showDownPanel: true,
  theme
});

addons.getChannel().on(CURRENT_THEME, theme => {
  document.documentElement.setAttribute('storybook-carbon-theme', theme);
});

const req = require.context("../stories", true, /.stories.ts$/);
function loadStories() {
	req.keys().forEach(filename => {
		req(filename);
	});
}

configure(loadStories, module);
