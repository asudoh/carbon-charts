export const addRadioButtonEventListeners = (container) => {
	// Add event listeners for radio buttons
	const radioButtons = container.querySelectorAll("div#theme-picker input.bx--radio-button");
	radioButtons.forEach(radioButton => {
		radioButton.addEventListener("click", (e: any) => {
			const theme = e.target.value;
			container.setAttribute("class", `container theme--${theme}`);
		});
	});
};
