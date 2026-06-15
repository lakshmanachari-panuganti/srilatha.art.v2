<#
Send-WhatsAppOrderConfirmation `
    -CustomerPhoneNumber "919014393938" `
    -CustomerName "Lakshman" `
    -OrderNumber "2026060522305511" `
    -InvoiceUrl "https://<storageacnt>.blob.core.windows.net/img/invoice-2026060522305511.pdf"
#>
function Send-WhatsAppOrderConfirmation {
    param(
        [Parameter(Mandatory)]
        [string]$CustomerPhoneNumber,

        [Parameter(Mandatory)]
        [string]$CustomerName,

        [Parameter(Mandatory)]
        [string]$OrderNumber,

        [Parameter(Mandatory)]
        [string]$InvoiceUrl
    )

    $accessToken = $env:WHATSAPP_ACCESS_TOKEN
    $phoneNumberId = $env:WHATSAPP_PHONE_NUMBER_ID

    if ([string]::IsNullOrWhiteSpace($accessToken)) {
        throw "WHATSAPP_ACCESS_TOKEN environment variable is missing."
    }

    if ([string]::IsNullOrWhiteSpace($phoneNumberId)) {
        throw "WHATSAPP_PHONE_NUMBER_ID environment variable is missing."
    }

    # Remove +, spaces, etc.
    $formattedNumber = $CustomerPhoneNumber -replace '[^\d]', ''

    $uri = "https://graph.facebook.com/v23.0/$phoneNumberId/messages"

    $body = @{
        messaging_product = "whatsapp"
        recipient_type    = "individual"
        to                = $formattedNumber
        type              = "template"

        template          = @{
            name       = "order_confirmation_new_artwork"

            language   = @{
                code = "en_US"
            }

            components = @(
                # PDF Invoice Attachment
                @{
                    type       = "header"
                    parameters = @(
                        @{
                            type     = "document"
                            document = @{
                                link     = $InvoiceUrl
                                filename = "Invoice.pdf"
                            }
                        }
                    )
                },

                # Body Variables
                @{
                    type       = "body"
                    parameters = @(
                        @{
                            type = "text"
                            text = $CustomerName
                        },
                        @{
                            type = "text"
                            text = $OrderNumber
                        }
                    )
                },

                # Dynamic URL Button (Order Details)
                @{
                    type       = "button"
                    sub_type   = "url"
                    index      = "0"
                    parameters = @(
                        @{
                            type = "text"
                            text = $OrderNumber
                        }
                    )
                }
            )
        }
    }

    $jsonBody = $body | ConvertTo-Json -Depth 20

    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "WhatsApp Request Payload"
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host $jsonBody
    Write-Host ""

    try {
        Write-Host "Sending WhatsApp template message..." -ForegroundColor Yellow

        $response = Invoke-RestMethod `
            -Method POST `
            -Uri $uri `
            -Headers @{
            Authorization = "Bearer $accessToken"
        } `
            -ContentType "application/json" `
            -Body $jsonBody

        Write-Host ""
        Write-Host "Message sent successfully." -ForegroundColor Green
        Write-Host "Message ID: $($response.messages.id)" -ForegroundColor Green

        return $response
    } catch {
        Write-Host ""
        Write-Host "WhatsApp API Error:" -ForegroundColor Red

        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host $responseBody -ForegroundColor Red
        } else {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }

        throw
    }
}