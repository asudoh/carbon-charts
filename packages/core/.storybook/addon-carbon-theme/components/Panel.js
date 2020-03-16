import React, { createElement, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from '@storybook/components';
import { CURRENT_THEME } from '../shared';

/**
 * Storybook add-on panel for Carbon theme switcher.
 */
const Panel = ({ api, active }) => {
  const [currentTheme, setCurrentTheme] = useState('white');
  const handleChange = useCallback(
    event => {
      const { value } = event.target;
      setCurrentTheme(value);
      api.getChannel().emit(CURRENT_THEME, value);
    },
    [api]
  );
  return (
    active && createElement(
      Form,
      {},
      createElement(
        Form.Field,
        { label: 'Select Carbon theme:' },
        createElement(
          Form.Select,
          {
            name: 'carbon-theme',
            value: currentTheme,
            onChange: handleChange,
            size: 'flex',
          },
          ...(['white', 'g10', 'g90', 'g100']).map(theme => createElement('option', { key: theme, value: theme }, theme)),
        )))
  );
};

Panel.propTypes = {
  /**
   * The Storybook API object.
   */
  api: PropTypes.shape({
    getChannel: PropTypes.func,
  }).isRequired,

  /**
   * `true` if this Storybook add-on panel is active.
   */
  active: PropTypes.bool.isRequired,
};

export default Panel;
