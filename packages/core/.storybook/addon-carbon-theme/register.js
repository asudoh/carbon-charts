import React, { createElement } from 'react';
import addons from '@storybook/addons';
import Panel from './components/Panel';
import { ADDON_ID, PANEL_ID } from './shared';

addons.register(ADDON_ID, api => {
  addons.addPanel(PANEL_ID, {
    title: 'Carbon theme',
    render: ({ active, key }) => createElement(Panel, { api, key, active }),
  });
});
