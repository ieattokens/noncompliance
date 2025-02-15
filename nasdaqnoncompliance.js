const FMP_API_KEY = "4de2799ba0f90cbd498df562125c39bb"; // Your API Key

document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const industryDropdown = document.getElementById("industryDropdown");

  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        parseCSVFile(file);
      } else {
        alert("Please select a CSV file first.");
      }
    });
  }

  loadIndustryDropdown();
});

// Function to parse the uploaded CSV file
function parseCSVFile(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      processCSVData(results.data);
    },
    error: function (error) {
      console.error("Error parsing CSV file:", error.message);
      alert("Error parsing CSV file. Please check the format.");
    },
  });
}
// Function to add a new row to the table
function addRowToTable(
  tickerTableBody,
  symbol,
  companyName,
  industry,
  market,
  notificationDate
) {
  const newRow = document.createElement("tr");
  newRow.innerHTML = `
      <td>${symbol}</td>
      <td>${companyName || "N/A"}</td>
      <td>${industry || "Unknown Industry"}</td>
      <td>${market}</td>
      <td>${notificationDate}</td>
  `;
  tickerTableBody.appendChild(newRow);
}
// Process CSV Data: Extract relevant tickers and store them in localStorage
async function processCSVData(data) {
  const tickerTableBody = document.querySelector("#tickerTable tbody");
  if (!tickerTableBody) {
    console.error("Error: Could not find ticker table body element.");
    return;
  }

  if (!data || data.length === 0) {
    console.error("No data found in CSV.");
    return;
  }

  tickerTableBody.innerHTML = ""; // Clear table
  let industryGroups = {};
  let uniqueSymbols = new Set();

  data.forEach((row) => {
    if (row.Deficiency && row.Deficiency.trim() === "Bid Price") {
      let symbols = row.Symbol ? row.Symbol.split(/[,;\s]+/) : [];
      symbols.forEach((symbol) => {
        symbol = symbol.trim();
        if (symbol) uniqueSymbols.add(symbol);
      });
    }
  });

  if (uniqueSymbols.size === 0) {
    alert("No tickers found with 'Bid Price' deficiency.");
    return;
  }

  console.log("Fetching industry data for tickers:", [...uniqueSymbols]);
  let industryData = await fetchIndustryData([...uniqueSymbols]);

  data.forEach((row) => {
    if (row.Deficiency && row.Deficiency.trim() === "Bid Price") {
      let symbols = row.Symbol ? row.Symbol.split(/[,;\s]+/) : [];
      symbols.forEach((symbol) => {
        symbol = symbol.trim();
        if (!symbol) return;

        let industry = industryData[symbol] || "Unknown Industry";
        const market = row.Market ? row.Market.trim() : "N/A";
        const notificationDate = row["Notification Date"] || "N/A";

        if (!industryGroups[industry]) {
          industryGroups[industry] = [];
        }
        industryGroups[industry].push(symbol);

        addRowToTable(
          tickerTableBody,
          symbol,
          row["Issuer Name"],
          industry,
          market,
          notificationDate
        );
      });
    }
  });

  console.log("Grouped tickers by industry:", industryGroups);
  localStorage.setItem("industryTickers", JSON.stringify(industryGroups));
  populateIndustryDropdown(industryGroups);
}

// Store selected industry's tickers in localStorage
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
    const selectedIndustry = this.value;
    if (selectedIndustry && industryGroups[selectedIndustry]) {
      localStorage.setItem("selectedIndustry", selectedIndustry);
      localStorage.setItem(
        "filteredTickers",
        JSON.stringify(industryGroups[selectedIndustry])
      );
      alert(`Selected industry: ${selectedIndustry}`);
    }
  });
}

// Fetch industry data from FMP API
async function fetchIndustryData(symbols) {
  let industryMap = {};
  let batchSize = 10;

  for (let i = 0; i < symbols.length; i += batchSize) {
    let batch = symbols.slice(i, i + batchSize);
    let url = `https://financialmodelingprep.com/api/v3/profile/${batch.join(
      ","
    )}?apikey=${FMP_API_KEY}`;

    try {
      let response = await fetch(url);
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);

      let data = await response.json();
      data.forEach((stock) => {
        if (stock.symbol && stock.industry) {
          industryMap[stock.symbol] = stock.industry;
        }
      });
    } catch (error) {
      console.error("Error fetching industry data from FMP:", error);
    }
  }

  return industryMap;
}
