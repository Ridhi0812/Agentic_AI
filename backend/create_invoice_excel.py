import pandas as pd

# Data extracted from the provided invoice images
data = {
    'Invoice No': ['INV-12345-1', '123456'],
    'Date': ['26 June 2022', '12/9/2019'],
    'Bill To': ['Estelle Darcy', '[Name]'],
    'Bill To Address': ['123 Anywhere St., Any City', '[Street Address], [City, ST ZIP]'],
    'Bill To Phone': ['+123-456-7890', '[Phone]'],
    'From': ['Samira Hadid', 'Company Name'],
    'From Address': ['123 Anywhere St., Any City', '[Street Address], [City, ST ZIP]'],
    'From Phone': ['+123-456-7890', '[000-000-0000]'],
    'Sub Total': [0.00, 950.00],
    'Total': [0.00, 971.56]
}

df = pd.DataFrame(data)
df.to_excel('invoices.xlsx', index=False)
print('Excel file updated successfully with both invoices.')