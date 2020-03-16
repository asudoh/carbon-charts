const path = require("path");

module.exports = {
	addons: [
		"@storybook/preset-typescript"
	],
	webpackFinal: async (config, { configType }) => {
		config.module.rules.push({
			test: /\.scss$/,
			use: [
				"style-loader",
				"css-loader",
				{
					loader: "sass-loader",
					options: {
						prependData: `
							$feature-flags: (
								enable-css-custom-properties: true,
							);
						`,
						sassOptions: {
							includePaths: [path.resolve(__dirname + "../src")]
						}
					}
				}
			]
		});

		return config;
	}
};
