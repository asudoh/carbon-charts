import * as d3 from "d3";
import { Configuration } from "./configuration";
import { Tools } from "./tools";
import PatternsService from "./services/patterns";

export class BaseChart {
	static chartCount = 1;

	id = "";
	chartContainerID = "";

	// Chart element references
	container: any;
	holder: Element;
	svg: any;
	innerWrap: any;

	options: any = Object.assign({}, Configuration.options.BASE);

	// Data
	data: any;
	displayData: any;

	// Fill scales & fill related objects
	patternScale = {};
	colorScale = {};
	patternsService: PatternsService;

	// Event target
	events: any;
	eventHandlers = {
		tooltips: null
	};

	constructor(holder: Element, configs: any) {
		this.id = `chart-${BaseChart.chartCount++}`;

		(holder as HTMLElement).style.position = "relative";
		this.holder = holder;

		const {chartId, container} = this.setChartIDContainer();
		this.container = container;
		this.chartContainerID = chartId;

		if (configs.options) {
			this.options = Object.assign({}, this.options, configs.options);

			if (this.options.containerResizable) {
				this.resizeWhenContainerChange();
			}
		}

		this.events = document.createDocumentFragment();

		if (configs.data) {
			this.setData(configs.data);
		}
	}


	setData(data: any) {
		const { selectors } = Configuration;
		const innerWrapElement = this.holder.querySelector(selectors.INNERWRAP);
		const initialDraw = innerWrapElement === null;
		const newDataIsAPromise = Promise.resolve(data) === data;

		// Dispatch the update event
		this.events.dispatchEvent(new Event("data-change"));

		if (initialDraw || newDataIsAPromise) {
			this.updateOverlay().show();
		}

		// Hide current showing tooltip
		if (!initialDraw) {
			this.hideTooltip();
		}

		Promise.resolve(data).then(value => {
			// Dispatch the update event
			this.events.dispatchEvent(new Event("data-load"));

			// Process data
			// this.data = this.dataProcessor(Tools.clone(value));
			this.data = Tools.clone(value);
			this.displayData = this.dataProcessor(Tools.clone(value));

			const keys = this.getKeysFromData();

			// Grab the old legend items, the keys from the current data
			// Compare the two, if there are any differences (additions/removals)
			// Completely remove the legend and render again
			const oldLegendItems = this.getActiveLegendItems();
			const keysArray = Object.keys(keys);
			const { missing: removedItems, added: newItems } = Tools.arrayDifferences(oldLegendItems, keysArray);

			// Update keys for legend use the latest data keys
			this.options.keys = keys;

			// Set the color scale based on the keys present in the data
			this.setColorScale();

			// Add patterns to page, set pattern scales
			if (this.options.accessibility) {
				this.setPatterns();
			}

			// Perform the draw or update chart
			if (initialDraw) {
				this.initialDraw();
			} else {
				if (removedItems.length > 0 || newItems.length > 0) {
					this.addOrUpdateLegend();
				}

				this.update();
			}
		});
	}

	getKeysFromData() {
		const { datasets } = this.displayData;
		const keys = {};

		if (this.getLegendType() === Configuration.legend.basedOn.LABELS) {
			// Build out the keys array of objects to represent the legend items
			this.displayData.labels.forEach(label => {
				keys[label] = Configuration.legend.items.status.ACTIVE;
			});
		} else {
			this.displayData.datasets.forEach(dataset => {
				keys[dataset.label] = Configuration.legend.items.status.ACTIVE;
			});
		}

		// Apply disabled legend items from previous data
		// That also are applicable to the new data
		const disabledLegendItems = this.getDisabledLegendItems();
		Object.keys(keys).forEach(key => {
			if (disabledLegendItems.indexOf(key) !== -1) {
				keys[key] = Configuration.legend.items.status.DISABLED;
			}
		});

		return keys;
	}

	getLegendType() {
		const { datasets } = this.displayData;

		// TODO - Support the labels based legend for line chart
		if (datasets.length === 1 && datasets[0].backgroundColors.length > 1) {
			return Configuration.legend.basedOn.LABELS;
		} else {
			return Configuration.legend.basedOn.SERIES;
		}
	}

	setPatterns() {
		// Accessibility & patterns
		this.patternsService = new PatternsService();
		this.patternsService.addPatternSVGs(this.displayData, this.colorScale, this.chartContainerID, this.getLegendType());

		const patternURLs = this.patternsService.getFillValues();
		Object.keys(patternURLs).forEach(datasetLabel => {
			this.patternScale[datasetLabel] = d3.scaleOrdinal()
				.range(patternURLs[datasetLabel])
				.domain(this.getLegendItemKeys());
		});
	}

	setColorScale() {
		this.displayData.datasets.forEach(dataset => {
			this.colorScale[dataset.label] = d3.scaleOrdinal().range(dataset.backgroundColors).domain(this.displayData.labels);
		});
	}

	// TODO - Refactor
	getChartSize(container = this.container) {
		const noAxis = this.options.type === "pie" || this.options.type === "donut";

		let ratio, marginForLegendTop;
		if (container.node().clientWidth > Configuration.charts.widthBreak) {
			ratio = Configuration.charts.magicRatio;
			marginForLegendTop = 0;
		} else {
			marginForLegendTop = Configuration.charts.marginForLegendTop;
			ratio = 1;
		}

		// Store computed actual size, to be considered for change if chart does not support axis
		const marginsToExclude = noAxis ? 0 : (Configuration.charts.margin.left + Configuration.charts.margin.right);
		const computedChartSize = {
			height: container.node().clientHeight - marginForLegendTop,
			width: (container.node().clientWidth - marginsToExclude) * ratio
		};

		// If chart is of type pie or donut, width and height should equal to the min of the width and height computed
		if (noAxis) {
			let maxSizePossible = Math.min(computedChartSize.height, computedChartSize.width);
			maxSizePossible = Math.max(maxSizePossible, Configuration.pie.minWidth);

			return {
				height: maxSizePossible,
				width: maxSizePossible
			};
		}

		return computedChartSize;
	}

	/*
	 * removes the chart and any tooltips
	 */
	removeChart() {
		this.holder.remove();
	}

	setSVG(): any {
		const chartSize = this.getChartSize();
		this.svg = this.container.append("svg")
			.classed("chart-svg", true);

		this.innerWrap = this.svg.append("g")
			.classed("inner-wrap", true);

		return this.svg;
	}

	updateSVG() {
		const chartSize = this.getChartSize();
		this.svg.select(".x.axis")
			.attr("transform", `translate(0, ${chartSize.height})`);
		const grid = this.svg.select(".grid")
			.attr("clip-path", `url(${window.location.origin}${window.location.pathname}#clip)`);
		grid.select(".x.grid")
			.attr("transform", `translate(0, ${chartSize.width})`);
		grid.select(".y.grid")
			.attr("transform", `translate(0, 0)`);
	}

	// Default fallback when no data processing is needed
	dataProcessor(data: any) {
		return data;
	}

	/*
	 * called when the chart needs to be drawn initially
	 */
	initialDraw() {
		console.warn("You should implement your own `initialDraw()` function.");
	}

	updateChart() {
		console.warn("You should implement your own `updateChart()` function.");
	}

	resizeChart() {
		console.warn("You should implement your own `resizeChart()` function.");
	}

	update(value?: any) {
		console.warn("You should implement your own `update()` function.");
	}

	resizeWhenContainerChange() {
		let containerWidth = this.holder.clientWidth;
		let containerHeight = this.holder.clientHeight;
		const frame = () => {
			if (Math.abs(containerWidth - this.holder.clientWidth) > 1
				|| Math.abs(containerHeight - this.holder.clientHeight) > 1) {
				containerWidth = this.holder.clientWidth;
				containerHeight = this.holder.clientHeight;

				d3.selectAll(".legend-tooltip").style("display", "none");

				this.hideTooltip();
				this.resizeChart();
			}

			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	setClickableLegend() {
		const self = this;
		const c = d3.select(this.holder);

		if (this.getActiveLegendItems().length === 1) {
			c.selectAll(".legend-btn.active").classed("not-allowed", true);
		}

		c.selectAll(".legend-btn").each(function() {
			d3.select(this).on("click", function() {
				c.selectAll(".chart-tooltip").remove();
				c.selectAll(".label-tooltip").remove();

				// Only apply legend filters if there are more than 1 active legend items
				const activeLegendItems = self.getActiveLegendItems();
				const legendButton = d3.select(this);
				const enabling = !legendButton.classed("active");

				// If there are more than 1 active legend items & one is getting toggled on
				if (activeLegendItems.length > 1 || enabling) {
					self.updateLegend(this);
					self.applyLegendFilter(legendButton.select("text").text());
				}
				// If there are 2 active legend items & one is getting toggled off
				if (activeLegendItems.length === 2 && !enabling) {
					c.selectAll(".legend-btn.active").classed("not-allowed", true);
				}

				if (activeLegendItems.length === 1 && enabling) {
					c.selectAll(".legend-btn.not-allowed").classed("not-allowed", false);
				}
			});
		});
	}

	setChartIDContainer() {
		const parent = d3.select(this.holder);
		let chartId, container;
		if (parent.select(".chart-wrapper").nodes().length > 0) {
			container = parent.select(".chart-wrapper");
			chartId = container.attr("chart-id");

			container.selectAll(".chart-svg").remove();
		} else {
			chartId = this.id;
			container = parent.append("div");
			container.attr("chart-id", chartId)
				.classed("chart-wrapper", true);
			if (container.select(".legend-wrapper").nodes().length === 0) {
				const legendWrapper = container.append("div").attr("class", "legend-wrapper");
				legendWrapper.append("ul").attr("class", "legend");
			}
		}
		return {chartId, container};
	}

	// TODOCARBON - REFACTOR
	resetOpacity() {
		const svg = d3.selectAll("svg.chart-svg");
		svg.selectAll("path").attr("fill-opacity", Configuration.charts.resetOpacity.opacity);
		// svg.selectAll("path").attr("stroke-opacity", this.options.accessibility ? 1 : 0);

		svg.selectAll("circle")
			.attr("stroke-opacity", Configuration.charts.resetOpacity.opacity)
			.attr("fill", Configuration.charts.resetOpacity.circle.fill);
		svg.selectAll("rect")
			.attr("fill-opacity", Configuration.charts.resetOpacity.opacity)
			.attr("stroke-opacity", Configuration.charts.resetOpacity.opacity);
	}

	reduceOpacity(exception) {
		// this.svg.selectAll("rect, path").attr("fill-opacity", Configuration.charts.reduceOpacity.opacity);
		// this.svg.selectAll("rect, path").attr("stroke-opacity", Configuration.charts.reduceOpacity.opacity);

		const exceptedElement = d3.select(exception);
		const exceptedElementData = exceptedElement.datum() as any;
		d3.select(exception).attr("fill-opacity", false);
		d3.select(exception).attr("stroke-opacity", Configuration.charts.reduceOpacity.opacity);
		d3.select(exception).attr("fill", (d: any) => this.getFillScale()[d.datasetLabel](exceptedElementData.label));
	}

	// ================================================================================
	// Legend
	// ================================================================================
	getLegendItems() {
		let legendItems = {};
		if (this.options.keys) {
			legendItems = this.options.keys;
		}

		return legendItems;
	}

	getLegendItemArray() {
		const legendItems = this.getLegendItems();
		const legendItemKeys = Object.keys(legendItems);

		return legendItemKeys.map(key => ({
			key,
			value: legendItems[key]
		}));
	}

	getLegendItemKeys() {
		return Object.keys(this.getLegendItems());
	}

	getDisabledLegendItems() {
		const legendItems = this.getLegendItems();
		const legendItemKeys = Object.keys(legendItems);

		return legendItemKeys.filter(itemKey => legendItems[itemKey] === Configuration.legend.items.status.DISABLED);
	}

	getActiveLegendItems() {
		const legendItems = this.getLegendItems();
		const legendItemKeys = Object.keys(legendItems);

		return legendItemKeys.filter(itemKey => legendItems[itemKey] === Configuration.legend.items.status.ACTIVE);
	}

	updateLegend(legend) {
		const thisLegend = d3.select(legend);
		const circle = d3.select(legend).select(".legend-circle");

		thisLegend.classed("active", !thisLegend.classed("active"));
		if (thisLegend.classed("active")) {
			circle.style("background-color", circle.style("border-color"))
				.style("border-color", Configuration.legend.active.borderColor)
				.style("border-style", Configuration.legend.active.borderStyle)
				.style("border-width", Configuration.legend.active.borderWidth);
		} else {
			circle.style("border-color", circle.style("background-color"))
				.style("background-color", Configuration.legend.inactive.backgroundColor)
				.style("border-style", Configuration.legend.inactive.borderStyle)
				.style("border-width", Configuration.legend.inactive.borderWidth);
		}
	}

	addLegend() {
		if (this.container.select(".legend-tooltip").nodes().length > 0) {
			return;
		}

		const legendItemsArray = this.getLegendItemArray();
		const legendItems = this.container.select(".legend")
			.attr("font-size", Configuration.legend.fontSize)
			.selectAll("li.legend-btn")
			.data(legendItemsArray, d => d.key);

		legendItems.exit()
			.remove();

		const legendEnter = legendItems.enter()
			.append("li")
			.attr("class", "legend-btn active");

		legendEnter.append("div")
			.attr("class", "legend-circle");

		legendEnter.append("text");

		legendEnter.selectAll("text")
			.merge(legendItems.selectAll("text"))
			.text(d => d.key);

		legendEnter.select("div")
			.merge(legendItems.selectAll("div"))
			.style("background-color", (d, i) => {
				if (this.getLegendType() === Configuration.legend.basedOn.LABELS && d.value === Configuration.legend.items.status.ACTIVE) {
					return this.colorScale[this.displayData.datasets[0].label](d.key);
				} else if (d.value === Configuration.legend.items.status.ACTIVE) {
						return this.colorScale[d.key]();
				}

				return "white";
			});

		// Add hover effect for legend item circles
		this.addLegendCircleHoverEffect();
	}

	positionLegend() {
		if (this.container.select(".legend-tooltip").nodes().length > 0
			&& this.container.select(".legend-tooltip").node().style.display === "block") { return; }

		this.container.selectAll(".legend-btn").style("display", "inline-block");
		const svgWidth = this.container.select("g.inner-wrap").node().getBBox().width;
		if (this.isLegendOnRight()) {
			this.container.selectAll(".expand-btn").remove();
			this.container.select(".legend-wrapper").style("height", 0);
			const containerWidth = this.container.node().clientWidth;
			const legendWidth = containerWidth - svgWidth;
			this.container.select(".legend").classed("right-legend", true)
				.style("width", legendWidth + "px");
		} else {
			this.container.select(".legend-wrapper").style("height", Configuration.legend.wrapperHeight);
		}

		if (this.hasLegendExpandBtn()) {
			this.container.select(".legend").classed("right-legend", false)
				.style("width", null);
			const btns = this.container.selectAll(".legend-btn").nodes();
			let btnsWidth = 0;
			btns.forEach(btn => {
				if ((btnsWidth + btn.clientWidth + Configuration.legend.widthTolerance) > svgWidth) {
					d3.select(btn).style("display", "none");
				} else {
					btnsWidth += btn.clientWidth;
				}
			});
			if (this.container.select(".expand-btn").nodes().length === 0) {
				this.addTooltipOpenButtonToLegend();
			}
		}
	}

	addOrUpdateLegend() {
		this.addLegend();
		if (this.options.legendClickable) {
			this.setClickableLegend();
		}

		this.positionLegend();
	}

	addLegendCircleHoverEffect() {
		d3.selectAll("li.legend-btn")
			.on("mouseover", function() {
				const circleRef = d3.select(this).select("div.legend-circle");
				const color = (circleRef.node() as HTMLElement).style.backgroundColor.substring(4,
					(circleRef.node() as HTMLElement).style.backgroundColor.length - 1);

				circleRef.style(
					"box-shadow",
					`0 0 0 ${Configuration.legend.hoverShadowSize} rgba(${color}, ${Configuration.legend.hoverShadowTransparency})`
				);
			})
			.on("mouseout", function() {
				d3.select(this).select("div.legend-circle").style("box-shadow", "none");
			});
	}

	hasLegendExpandBtn() {
		return (
			this.container.node().clientWidth < Configuration.charts.widthBreak ||
				this.container.node().clientHeight < this.container.select("ul.legend").node().clientHeight

			// && this.getLegendItems().length > Configuration.legend.countBreak
		);
	}

	isLegendOnRight() {
		return (
			this.container.node().clientWidth > Configuration.charts.widthBreak &&
				this.container.node().clientHeight > this.container.select("ul.legend").node().clientHeight

			// && this.getLegendItems().length > Configuration.legend.countBreak
		);
	}

	/**
	 *
	 * When a legend item is clicked, apply/remove the appropriate filter
	 * @param {string} changedLabel The label of the legend element the user clicked on
	 * @memberof PieChart
	 */
	applyLegendFilter(changedLabel: string) {
		const { ACTIVE, DISABLED } = Configuration.legend.items.status;
		const oldStatus = this.options.keys[changedLabel];

		this.options.keys[changedLabel] = (oldStatus === ACTIVE ? DISABLED : ACTIVE);

		this.update();
	}

	setClickableLegendInTooltip() {
		const self = this;
		const c = d3.select(this.container);
		const tooltip = c.select(".legend-tooltip-content");
		tooltip.selectAll(".legend-btn").each(function() {
			d3.select(this).on("click", function() {
				self.updateLegend(this);

				// TODO - setClickableLegendInTooltip()
			});
		});
	}

	// ================================================================================
	// Tooltips
	// ================================================================================
	addTooltipOpenButtonToLegend() {
		const self = this;
		const thisLegend = this.container.select(".legend");
		thisLegend.append("div")
			.attr("class", "expand-btn")
			.style("cursor", "pointer")
			.on("click", function() {
				self.openLegendTooltip(this);
			});
	}

	// TODO - Refactor
	openLegendTooltip(target) {
		d3.selectAll(".legend-tooltip").remove();
		const mouseXPoint = d3.mouse(this.container.node())[0];
		const windowXPoint = d3.event.x;
		let tooltip;
		if (this.container.select(".legend-tooltip").nodes().length > 0) {
			tooltip = d3.selectAll(".legend-tooltip").style("display", "block");
			tooltip.select("arrow").remove();
		} else {
			tooltip = this.container.append("div")
				.attr("class", "tooltip legend-tooltip")
				.style("display", "block")
				.style("top", (d3.mouse(this.container.node())[1] - Configuration.legend.margin.top) + "px");
			tooltip.append("p").text("Legend")
				.attr("class", "legend-tooltip-header");
			tooltip.append("ul")
				.attr("class", "legend-tooltip-content")
				.attr("font-size", Configuration.legend.fontSize);
			Tools.addCloseBtn(tooltip, "md", "white")
				.on("click", () => {
					d3.selectAll(".legend-tooltip").style("display", "none");
				});

			const activeLegendItems = this.getActiveLegendItems();
			const legendContent = d3.select(".legend-tooltip-content")
				.attr("font-size", Configuration.legend.fontSize)
				.selectAll("div")
				.data(this.getLegendItemArray(), (d: any) => d.key)
				.enter()
					.append("li")
					.classed("legend-btn", true)
					.classed("active", d => d.value === Configuration.legend.items.status.ACTIVE)
					.classed("not-allowed", d => activeLegendItems.length === 1 && d.value === Configuration.legend.items.status.ACTIVE)
					.on("click", (clickedItem, e) => {
						const legendButton = d3.select(d3.event.currentTarget);
						const enabling = !legendButton.classed("active");

						if (activeLegendItems.length > 1 || enabling) {
							this.updateLegend(d3.event.currentTarget);

							this.applyLegendFilter(clickedItem.key);

							this.container.selectAll("ul.legend li.legend-btn")
								.data(this.getLegendItemArray(), (d: any) => d.key)
								.classed("active", d => d.value === Configuration.legend.items.status.ACTIVE)
								.select("div.legend-circle")
								.style("background-color", (d, i) => {
									if (this.getLegendType() === Configuration.legend.basedOn.LABELS && d.value === Configuration.legend.items.status.ACTIVE) {
										return this.colorScale[this.displayData.datasets[0].label](d.key);
									} else if (d.value === Configuration.legend.items.status.ACTIVE) {
										return this.colorScale[d.key]();
									}

									return "white";
								})
								.style("border-color", d => {
									if (this.getLegendType() === Configuration.legend.basedOn.LABELS) {
										return this.colorScale[this.displayData.datasets[0].label](d.key);
									} else {
										return this.colorScale[d.key]();
									}
								})
								.style("border-style", Configuration.legend.inactive.borderStyle)
								.style("border-width", Configuration.legend.inactive.borderWidth);
						}

						// If there are 2 active legend items & one is getting toggled off
						if (activeLegendItems.length === 2 && !enabling) {
							this.container.selectAll(".legend-btn.active").classed("not-allowed", true);
						}

						if (activeLegendItems.length === 1 && enabling) {
							this.container.selectAll(".legend-btn.not-allowed").classed("not-allowed", false);
						}
					});

			legendContent.append("div")
				.attr("class", "legend-circle")
				.style("background-color", (d, i) => {
					if (this.getLegendType() === Configuration.legend.basedOn.LABELS && d.value === Configuration.legend.items.status.ACTIVE) {
						return this.colorScale[this.displayData.datasets[0].label](d.key);
					} else if (d.value === Configuration.legend.items.status.ACTIVE) {
						return this.colorScale[d.key]();
					}

					return "white";
				})
				.style("border-color", d => {
					if (this.getLegendType() === Configuration.legend.basedOn.LABELS) {
						return this.colorScale[this.displayData.datasets[0].label](d.key);
					} else {
						return this.colorScale[d.key]();
					}
				})
				.style("border-style", Configuration.legend.inactive.borderStyle)
				.style("border-width", Configuration.legend.inactive.borderWidth);
			this.addLegendCircleHoverEffect();

			legendContent.append("text")
				.text(d => d.key);
		}

		// Position the tooltip
		tooltip.classed("arrow-right", true);
		tooltip.append("div").attr("class", "arrow");
		tooltip.style("left", `${mouseXPoint - Configuration.tooltip.width - Configuration.tooltip.arrowWidth}px`);
	}

	showLabelTooltip(d, leftSide) {
		d3.selectAll(".label-tooltip").remove();
		const mouseXPoint = d3.mouse(this.holder as SVGSVGElement)[0] + Configuration.tooltip.arrowWidth;
		const tooltip = this.container.append("div")
			.attr("class", "tooltip label-tooltip")
			.style("top", d3.mouse(this.holder as SVGSVGElement)[1] - Configuration.tooltip.magicTop1 + "px");
		Tools.addCloseBtn(tooltip, "xs")
			.on("click", () => {
				this.resetOpacity();
				d3.selectAll(".tooltip").remove();
			});
		tooltip.append("p").text(d);

		if (leftSide) {
			tooltip.classed("arrow-left", true)
					.style("left", mouseXPoint + "px")
					.append("div").attr("class", "arrow");
		} else {
			tooltip.classed("arrow-right", true);

			const xPoint = mouseXPoint - (tooltip.node() as Element).clientWidth - Configuration.tooltip.magicXPoint2;
			tooltip.style("left", xPoint + "px")
					.append("div").attr("class", "arrow");
		}
	}

	hideTooltip() {
		this.resetOpacity();

		const tooltipRef = d3.select(this.holder).select("div.chart-tooltip");
		tooltipRef.style("opacity", 1)
			.transition()
			.duration(Configuration.tooltip.fadeOut.duration)
			.style("opacity", 0)
			.remove();

		this.removeTooltipEventListeners();
	}

	addTooltipEventListeners(tooltip: any) {
		this.eventHandlers.tooltips = (evt: Event) => {
			const targetTagName = evt.target["tagName"];
			const targetsToBeSkipped = ["rect", "circle", "path"];

			// If keyboard event
			if (evt["key"]) {
				if (evt["key"] === "Escape" || evt["key"] === "Esc") {
					this.hideTooltip();
				}
			} else if (targetsToBeSkipped.indexOf(targetTagName) === -1) {
				// If mouse event
				this.hideTooltip();
			}
		};

		// Apply the event listeners to close the tooltip
		// setTimeout is there to avoid catching the click event that opened the tooltip
		setTimeout(() => {
			// When ESC is pressed
			window.addEventListener("keydown", this.eventHandlers.tooltips);

			// TODO - Don't bind on window
			// If clicked outside
			this.holder.addEventListener("click", this.eventHandlers.tooltips);

			// Stop clicking inside tooltip from bubbling up to window
			tooltip.on("click", () => {
				d3.event.stopPropagation();
			});
		}, 0);
	}

	removeTooltipEventListeners() {
		// TODO - Don't bind on window
		// Remove eventlistener to close tooltip when ESC is pressed
		window.removeEventListener("keydown", this.eventHandlers.tooltips);

		// Remove eventlistener to close tooltip when clicked outside
		this.holder.removeEventListener("click", this.eventHandlers.tooltips);
	}

	showTooltip(d, clickedElement) {
		// Rest opacity of all elements in the chart
		this.resetOpacity();

		// Remove existing tooltips on the page
		// TODO - Update class to not conflict with other elements on page
		d3.selectAll(".tooltip").remove();

		// Draw tooltip
		const tooltip = d3.select(this.holder).append("div")
			.attr("class", "tooltip chart-tooltip")
			// .style("border-color", this.colorScale[d.datasetLabel](d.label))
			.style("top", d3.mouse(this.holder as SVGSVGElement)[1] - Configuration.tooltip.magicTop2 + "px");

		// TODOCARBON - Remove
		// Add close button to tooltip
		// Tools.addCloseBtn(tooltip, "xs")
		// 	.on("click", () => {
		// 		this.hideTooltip();
		// 	});

		let tooltipHTML = "";
		const formattedValue = this.options.tooltip.formatter ? this.options.tooltip.formatter(d.value) : d.value.toLocaleString("en");
		if (this.getLegendType() === Configuration.legend.basedOn.LABELS) {
			tooltipHTML += `
				<b>${d.label}:</b> ${formattedValue}<br/>
			`;
		} else {
			tooltipHTML += `
				<b>${d.datasetLabel}:</b> ${formattedValue}<br/>
			`;
		}

		tooltip.append("div").attr("class", "text-box").html(tooltipHTML);

		// Draw tooltip arrow in the right direction
		if (d3.mouse(this.holder as SVGSVGElement)[0] + (tooltip.node() as Element).clientWidth > this.holder.clientWidth) {
			tooltip.style(
				"left",
				d3.mouse(this.holder as SVGSVGElement)[0] - (tooltip.node() as Element).clientWidth - Configuration.tooltip.magicLeft1 + "px"
			);
		} else {
			tooltip.style("left", d3.mouse(this.holder as SVGSVGElement)[0] + Configuration.tooltip.magicLeft2 + "px");
		}

		tooltip.style("opacity", 0)
			.transition()
			.duration(Configuration.tooltip.fadeIn.duration)
			.style("opacity", 1);

		this.addTooltipEventListeners(tooltip);
	}

	getFillScale() {
		return this.options.accessibility ? this.patternScale : this.colorScale;
	}

	getDefaultTransition() {
		if (this.options.animations === false) {
			return this.getInstantTransition();
		} else {
			return d3.transition().duration(Configuration.transitions.default.duration);
		}
	}

	getInstantTransition() {
		return d3.transition().duration(0);
	}

	// Used to determine whether to use a transition for updating fill attributes in charting elements
	// Will disable the transition if in accessibility mode
	getFillTransition(animate?: boolean) {
		if (this.options.animations === false) {
			return this.getInstantTransition();
		} else {
			return d3.transition().duration(animate === false ? 0 : Configuration.transitions.default.duration);
		}
	}

	// ================================================================================
	// Loading overlay
	// ================================================================================
	updateOverlay() {
		const overlayElement = <HTMLElement>this.holder.querySelector("div.chart-overlay");

		return {
			show: () => {
				// If overlay element has already been added to the chart container
				// Just show it
				if (overlayElement) {
					overlayElement.style.display = "block";
				} else {
					const loadingOverlay = document.createElement("div");

					loadingOverlay.classList.add("chart-overlay");
					loadingOverlay.innerHTML = this.options.loadingOverlay.innerHTML;

					this.holder.appendChild(loadingOverlay);
				}
			},
			hide: () => {
				overlayElement.style.display = "none";
			}
		};
	}

	getBBox(selector: any) {
		return this.innerWrap.select(selector).node().getBBox();
	}
}
