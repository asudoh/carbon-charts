import { configure } from '@storybook/react';
import { withOptions } from '@storybook/addon-options';

withOptions({
	name: 'Carbon Charts - React Wrappers',
	panelPosition: 'bottom',
	showDownPanel: true,
	showAddonPanel: true,
	sortStoriesByKind: true
});

// load global styles
require("!style-loader!css-loader!@carbon/charts/demo/styles.css");
require("!style-loader!css-loader!@carbon/charts/styles.css");

const req = require.context("../stories/", true, /.stories.js$/);
function loadStories() {
	req.keys().forEach(filename => {
		req(filename);
	});
}

configure(loadStories, module);
