import swaggerJSDoc from 'swagger-jsdoc'

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GYM Management App',
      version: '2.0.0',
      description: 'API documentation for the Mosn Gym App'
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            country: { type: 'string' },
            postalCode: { type: 'string' }
          }
        },
        Facility: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['room', 'amenity', 'conference', 'other'] },
            tenantId: { type: 'string', description: 'Tenant ID' },
            status: { type: 'string', enum: ['active', 'inactive', 'maintenance'] },
            parentFacility: { type: 'string', nullable: true },
            plugins: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    enum: ['pos', 'concierge', 'door_access', 'gym_management', 'cinema_management', 'bar_management', 'restaurant_management']
                  },
                  enabled: { type: 'boolean' },
                  config: { type: 'object' }
                }
              }
            }
          }
        },
        Booking: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Booking ID' },
            facility: { type: 'string', description: 'Facility ID' },
            tenant: { type: 'string', description: 'Tenant ID' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] },
            customerEmail: { type: 'string', format: 'email', nullable: true },
            invoice: { type: 'string', nullable: true, description: 'Invoice ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Club: {
          type: 'object',
          properties: {
            tenant: { type: 'string', description: 'Tenant ID' },
            logourl: { type: 'string' },
            brandName: { type: 'string' },
            companyName: { type: 'string' },
            description: { type: 'string' },
            slogan: { type: 'string' },
            owner: { type: 'string', description: 'Owner User ID' },
            primaryEmail: { type: 'string', format: 'email' },
            secondaryEmail: { type: 'string', format: 'email' },
            billingEmail: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            appUrl: { type: 'string' },
            location: { type: 'string' },
            street: { type: 'string' },
            suburb: { type: 'string' },
            city: { type: 'string' },
            postalCode: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID' },
            tenant: { type: 'string', description: 'Tenant ID' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            address: { $ref: '#/components/schemas/Address' },
            role: { type: 'string', enum: ['user', 'admin', 'tenant_admin', 'SYSTEM_ADMIN'] },
            qrCodeId: { type: 'string', nullable: true },
            employeeId: { type: 'string', nullable: true },
            department: { type: 'string', nullable: true },
            twoFactorEnabled: { type: 'boolean', description: '2FA enabled status' },
            refreshTokens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  token: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'JWT access token' },
            refreshToken: { type: 'string', description: 'JWT refresh token' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'User ID' },
                email: { type: 'string', format: 'email', description: 'User email' },
                role: { type: 'string', enum: ['user', 'admin', 'tenant_admin', 'SYSTEM_ADMIN'], description: 'User role' },
                tenant: { type: 'string', description: 'Tenant ID' },
                twoFactorEnabled: { type: 'boolean', description: '2FA enabled status' }
              }
            }
          },
          required: ['accessToken', 'refreshToken']
        },
        SignupRequest: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', description: 'User email' },
            password: { type: 'string', format: 'password', description: 'User password' },
            role: { type: 'string', enum: ['user', 'admin', 'tenant_admin', 'SYSTEM_ADMIN'], description: 'User role' },
            tenantId: { type: 'string', description: 'Tenant ID' }
          },
          required: ['email', 'password', 'role', 'tenantId']
        },
        LoginRequest: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', description: 'User email' },
            password: { type: 'string', format: 'password', description: 'User password' }
          },
          required: ['email', 'password']
        },
        Verify2FARequest: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' },
            token: { type: 'string', description: '2FA token' }
          },
          required: ['userId', 'token']
        },
        RefreshTokenRequest: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'Refresh token' }
          },
          required: ['token']
        },
        InvoiceItem: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unitPrice: { type: 'number' },
            total: { type: 'number' },
            service: { type: 'string', nullable: true, description: 'Service ID' }
          },
          required: ['description', 'quantity', 'unitPrice', 'total']
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Invoice ID' },
            tenantId: { type: 'string', description: 'Tenant ID' },
            booking: { type: 'string', nullable: true, description: 'Booking ID' },
            guest: { type: 'string', nullable: true, description: 'Guest ID' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/InvoiceItem' }
            },
            totalAmount: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'paid', 'cancelled'] },
            dueDate: { type: 'string', format: 'date' },
            issuedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          },
          required: ['tenantId', 'items', 'totalAmount', 'status', 'dueDate']
        },
        PosTransaction: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Transaction ID' },
            facility: { type: 'string', description: 'Facility ID' },
            tenant: { type: 'string', description: 'Tenant ID' },
            amount: { type: 'number' },
            description: { type: 'string' },
            booking: { type: 'string', nullable: true, description: 'Booking ID' },
            guest: { type: 'string', nullable: true, description: 'Guest ID' },
            invoice: { type: 'string', nullable: true, description: 'Invoice ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          },
          required: ['facility', 'tenant', 'amount', 'description']
        },
        ConciergeRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Request ID' },
            facility: { type: 'string', description: 'Facility ID' },
            tenant: { type: 'string', description: 'Tenant ID' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            guest: { type: 'string', nullable: true, description: 'Guest ID' },
            booking: { type: 'string', nullable: true, description: 'Booking ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          },
          required: ['facility', 'tenant', 'description', 'status']
        }
      }
    }
  },
  //apis: ['./src/swagger/club.swagger.ts','./src/swagger/auth.swagger.ts', './src/swagger/booking.swagger.ts', './src/swagger/facility.swagger.ts', './src/swagger/guest.swagger.ts', './src/swagger/invoice.swagger.ts', './src/swagger/plugin.swagger.ts', './src/swagger/tenant.swagger.ts', './src/swagger/user.swagger.ts', './src/swagger/room.swagger.ts']
  apis: ['./src/swagger/club.swagger.ts', './src/swagger/auth.swagger.ts']
}



export const swaggerSpec = swaggerJSDoc(swaggerOptions)
