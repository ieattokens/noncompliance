const FMP_API_KEY = "4de279ba0f90cbd498df562125c39bb"; // Your API Key

document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const tickerTableBody = document.querySelector("#tickerTable tbody");

  if (document.getElementById("industryDropdown")) {
    console.log("Industry dropdown detected, loading stored data...");
    loadIndustryDropdown();
  } else {
    console.log("Industry dropdown not found on this page.");
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        parseCSVFile(file, tickerTableBody);
      } else {
        alert("Please select a CSV file first.");
      }
    });
  }
});

function loadIndustryDropdown() {
  let storedData = JSON.parse(localStorage.getItem("industryTickers"));

  if (storedData && Date.now() - storedData.timestamp < 86400000) {
    console.log("Using cached industry data.");
    populateIndustryDropdown(storedData.data);
  } else {
    console.log("No valid cached data found. Fresh data required.");
    localStorage.removeItem("industryTickers");
  }
}

function populateIndustryDropdown(industryGroups) {
  const industryDropdown = document.getElementById("industryDropdown");
  if (!industryDropdown) return;

  industryDropdown.innerHTML = `<option value="">Select Industry</option>`;
  Object.keys(industryGroups).forEach((industry) => {
    const option = document.createElement("option");
    option.value = industry;
    option.textContent = industry;
    industryDropdown.appendChild(option);
  });

  industryDropdown.addEventListener("change", function () {
    filterTableByIndustry(this.value);
  });
}

function filterTableByIndustry(selectedIndustry) {
  const tickerTableBody = document.querySelector("#tickerTable tbody");
  tickerTableBody.innerHTML = ""; // Clear table

  const storedIndustryGroups =
    JSON.parse(localStorage.getItem("industryTickers"))?.data || {};

  let filteredTickers = [];

  if (!selectedIndustry) {
    Object.values(storedIndustryGroups)
      .flat()
      .forEach((tickerData) => {
        addRowToTable(tickerTableBody, tickerData);
        filteredTickers.push(tickerData.symbol);
      });
  } else {
    if (storedIndustryGroups[selectedIndustry]) {
      storedIndustryGroups[selectedIndustry].forEach((tickerData) => {
        addRowToTable(tickerTableBody, tickerData);
        filteredTickers.push(tickerData.symbol);
      });
    }
  }

  // Store the filtered tickers
  localStorage.setItem("filteredTickers", JSON.stringify(filteredTickers));
  console.log("Filtered tickers stored:", filteredTickers);
}

function addRowToTable(tickerTableBody, tickerData) {
  const newRow = document.createElement("tr");
  newRow.innerHTML = `
      <td>${tickerData.symbol}</td>
      <td>${tickerData.companyName || "N/A"}</td>
      <td>${tickerData.industry || "Unknown Industry"}</td>
      <td>${tickerData.market}</td>
      <td>${tickerData.notificationDate}</td>
  `;
  tickerTableBody.appendChild(newRow);
}
