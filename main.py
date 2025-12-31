import requests
import json
import base64
from datetime import datetime, timedelta
import time

class QuickBooksClient:
    def __init__(self):
        # OAuth Credentials
        self.client_id = "ABQz9ZWYKt14GwXJ1Cv2bVKo0gzao65vL4385OnCiT51kipRi8"
        self.client_secret = "bVWPFPw7K1RR2InlWKY8Kn75KuNiAFzn58gyCUz2"
        self.realm_id = "9341455688027969"
        
        # Current tokens (you can update these with your latest tokens)
        self.access_token = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..UyIgxAEXuObewMwu40HAzA.BgPL7OFc_ibEz7yiGvYHKOk2--EMkq1544YGURWshlFokW291PTijAlr1fM8xz6nVlysV1wnz7wAwMZvWqepF2gmcFbMPG-JqSYtjUZILI0Mj1mwYGn43_xmX1sMg6SYwh1PrLIiDBElmIq1CyN0rtb5BVbisnh8lAM54F468FQyIExmOZF0Y3Sgsx6XRZnumTFresNDTLdPW_ESUliX7nrWt3rluKLkoZ4sY8xBMk7oq5DU0bp9HHvCEBtEwvF0MUpQeAX8SRYxq5KGvGGyYBTeHg00SZxZAiYceTQy14VpdUI5abqswUpLnc2NiJJ2KLowt8_3lmZktWAO4XZjIPpO59KOeIzakf2jR952-VWpXsMxYAUMHhfZvyr3QlokZ81dJ7zHsR5a5ZQC-1UwshwJhYBQoyzEppuSwNQT8Ie_ULpxv6UGzQx4-fyfGg8zQiDR5Eei6PHzjC-JWzkIqGWDwHugnG_Jf3QvyI7Jp0YZ5zie2Uwj01Q5TX5-iBabbCwQXwG3aEJl9DzOPk_khB4TYAeYog5W-FEBlGKp-FRBXDQckP9FDEYBsuQoCjnt2USbOm8hBVTFfmATs-J15Ot83XG2igodlfN-KAfgJYyBEjYx0XuqVpApNiMP97Gy.vPde5AZe5V03qFswc_0Zjw"
        self.refresh_token = "RT1-48-H0-177234387175ux9gsgaarl0gopbfc6"
        
        # Token expiry tracking (set to expired initially to force refresh)
        self.token_expires_at = datetime.now()
        
        # API URLs
        self.token_url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
        self.sandbox_base_url = "https://sandbox-quickbooks.api.intuit.com"
        
    def get_basic_auth_header(self):
        """Generate Basic Authentication header from client credentials"""
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"
    
    def refresh_access_token(self):
        """Refresh the access token using the refresh token"""
        print("Refreshing access token...")
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Authorization": self.get_basic_auth_header()
        }
        
        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token
        }
        
        try:
            response = requests.post(
                self.token_url,
                headers=headers,
                data=data  # requests library will automatically URL-encode this
            )
            
            if response.status_code == 200:
                token_data = response.json()
                
                # Update tokens
                self.access_token = token_data.get("access_token")
                new_refresh_token = token_data.get("refresh_token")
                if new_refresh_token:
                    self.refresh_token = new_refresh_token
                
                # Update expiry time (subtract 5 minutes for safety margin)
                expires_in = token_data.get("expires_in", 3600)
                self.token_expires_at = datetime.now() + timedelta(seconds=expires_in - 300)
                
                print(f"✅ Access token refreshed successfully!")
                print(f"   Token expires at: {self.token_expires_at}")
                
                # Save tokens to file for future use
                self.save_tokens()
                
                return True
            else:
                print(f"❌ Failed to refresh token: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error refreshing token: {str(e)}")
            return False
    
    def ensure_valid_token(self):
        """Check if token is valid and refresh if needed"""
        if datetime.now() >= self.token_expires_at:
            print("Access token expired or about to expire. Refreshing...")
            return self.refresh_access_token()
        else:
            print("✅ Access token is still valid")
            return True
    
    def get_invoices(self):
        """Retrieve all invoices from QuickBooks"""
        # Ensure we have a valid token
        if not self.ensure_valid_token():
            print("❌ Unable to obtain valid access token")
            return None
        
        print("\nFetching invoices from QuickBooks...")
        
        # Prepare the API request
        url = f"{self.sandbox_base_url}/v3/company/{self.realm_id}/query"
        
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/text"
        }
        
        # Query to get all invoices
        params = {
            "query": "select * from Invoice"
        }
        
        try:
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 200:
                invoice_data = response.json()
                print(f"✅ Successfully retrieved invoice data!")
                
                # Parse and display invoice summary
                invoices = invoice_data.get("QueryResponse", {}).get("Invoice", [])
                print(f"\n📋 Found {len(invoices)} invoice(s)")
                
                return invoice_data
            
            elif response.status_code == 401:
                print("❌ Authentication failed. Attempting to refresh token...")
                if self.refresh_access_token():
                    # Retry the request with new token
                    headers["Authorization"] = f"Bearer {self.access_token}"
                    response = requests.get(url, headers=headers, params=params)
                    if response.status_code == 200:
                        invoice_data = response.json()
                        print(f"✅ Successfully retrieved invoice data after token refresh!")
                        return invoice_data
                
                print(f"❌ Failed to retrieve invoices: {response.status_code}")
                print(f"   Response: {response.text}")
                return None
            
            else:
                print(f"❌ Failed to retrieve invoices: {response.status_code}")
                print(f"   Response: {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Error retrieving invoices: {str(e)}")
            return None
    
    def save_tokens(self):
        """Save current tokens to a file for future use"""
        tokens = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_expires_at": self.token_expires_at.isoformat()
        }
        
        with open("quickbooks_tokens.json", "w") as f:
            json.dump(tokens, f, indent=2)
        print("💾 Tokens saved to quickbooks_tokens.json")
    
    def load_tokens(self):
        """Load tokens from file if they exist"""
        try:
            with open("quickbooks_tokens.json", "r") as f:
                tokens = json.load(f)
                self.access_token = tokens.get("access_token")
                self.refresh_token = tokens.get("refresh_token")
                expires_at_str = tokens.get("token_expires_at")
                if expires_at_str:
                    self.token_expires_at = datetime.fromisoformat(expires_at_str)
                print("💾 Tokens loaded from quickbooks_tokens.json")
                return True
        except FileNotFoundError:
            print("📝 No saved tokens found, using initial tokens")
            return False
        except Exception as e:
            print(f"⚠️ Error loading tokens: {str(e)}")
            return False
    
    def display_invoice_summary(self, invoice_data):
        """Display a summary of the retrieved invoices"""
        if not invoice_data:
            return
        
        invoices = invoice_data.get("QueryResponse", {}).get("Invoice", [])
        
        if not invoices:
            print("\n📭 No invoices found")
            return
        
        print("\n" + "="*60)
        print("INVOICE SUMMARY")
        print("="*60)
        
        for invoice in invoices:
            print(f"\n📄 Invoice #{invoice.get('DocNumber', 'N/A')}")
            print(f"   Customer: {invoice.get('CustomerRef', {}).get('name', 'N/A')}")
            print(f"   Date: {invoice.get('TxnDate', 'N/A')}")
            print(f"   Due Date: {invoice.get('DueDate', 'N/A')}")
            print(f"   Total Amount: ${invoice.get('TotalAmt', 0):.2f}")
            print(f"   Balance: ${invoice.get('Balance', 0):.2f}")
            
            # Email status
            email_status = invoice.get('EmailStatus', 'NotSet')
            print(f"   Email Status: {email_status}")
            
            # Line items summary
            line_items = invoice.get('Line', [])
            if line_items:
                print(f"   Line Items: {len([item for item in line_items if item.get('DetailType') == 'SalesItemLineDetail'])}")
        
        print("\n" + "="*60)


def main():
    """Main function to execute the QuickBooks invoice retrieval"""
    print("="*60)
    print("QUICKBOOKS INVOICE RETRIEVAL SCRIPT")
    print("="*60)
    
    # Initialize the QuickBooks client
    qb_client = QuickBooksClient()
    
    # Try to load saved tokens
    qb_client.load_tokens()
    
    # Get invoices
    invoice_data = qb_client.get_invoices()
    
    if invoice_data:
        # Display summary
        qb_client.display_invoice_summary(invoice_data)
        
        # Save full response to file
        output_file = "quickbooks_invoices.json"
        with open(output_file, "w") as f:
            json.dump(invoice_data, f, indent=2)
        print(f"\n💾 Full invoice data saved to {output_file}")
        
        # Return the data
        return invoice_data
    else:
        print("\n❌ Failed to retrieve invoice data")
        return None


if __name__ == "__main__":
    # Run the main function
    invoice_data = main()
    
    # Optionally print the raw JSON response
    if invoice_data:
        print("\n" + "="*60)
        print("RAW JSON RESPONSE (first 1000 characters):")
        print("="*60)
        json_str = json.dumps(invoice_data, indent=2)
        print(json_str[:1000] + "..." if len(json_str) > 1000 else json_str)