# Gene Synthesis Ordering Platform - TODO

## Phase 1: Core Infrastructure
- [x] Design and implement database schema
- [x] Set up authentication (local + DingTalk OAuth)
- [x] Create base navigation and layout structure

## Phase 2: Sequence Input & Structuring
- [x] Sequence paste input component
- [x] FASTA/GenBank file upload and parsing
- [x] Five-segment structure definition UI (left homology arm, 5' flanking, CDS, 3' flanking, right homology arm)
- [x] Sequence validation and format detection
- [ ] Visual sequence structure preview

## Phase 3: Codon Optimization Engine
- [x] Host species selection (E.coli, CHO, HEK293, etc.)
- [x] Restriction site avoidance/retention settings
- [x] GC content adjustment parameters
- [x] Repeat sequence elimination
- [ ] Optimization result display with CAI score and GC plot
- [ ] DNAWorks algorithm integration (backend)

## Phase 4: Vector Library Management
- [x] Vector database CRUD operations
- [x] Vector information display (cloning sites, resistance, promoter)
- [x] Vector search and filtering
- [x] Vector sequence viewer
- [ ] Admin interface for vector management

## Phase 5: Cloning Strategy Design
- [x] Restriction enzyme cloning workflow
- [x] Seamless cloning workflow
- [ ] Automatic vector recommendation
- [ ] Restriction site analysis and recommendation
- [ ] Visual plasmid map generation
- [ ] Cloning strategy comparison view

## Phase 6: Primer Design Module
- [ ] PCR primer automatic design
- [ ] Sequencing primer design
- [ ] Primer component annotation (protective bases, restriction sites, annealing regions)
- [ ] Primer parameter settings (Tm, length, GC%)
- [ ] Primer result export

## Phase 7: Batch Ordering
- [x] Single sequence mode
- [x] Online table batch mode (20-50 entries)
- [x] Excel/CSV template download
- [x] File import and parsing
- [x] Intelligent data validation
- [x] Detailed error report generation
- [x] Partial import support

## Phase 8: Asynchronous Task Processing
- [x] Background task queue system (basic implementation)
- [x] Real-time status updates per order
- [x] Overall progress display
- [ ] Failed task retry mechanism
- [ ] Task notification system

## Phase 9: Order Management
- [x] Order list view with filtering
- [x] Order detail page
- [x] Real-time progress tracking
- [ ] Result report download (optimized sequences, primers, full report)
- [x] Order history and search

## Phase 10: Reference Data & Tools
- [x] Host species management page
- [x] Restriction enzyme reference page
- [x] Sequence tools (translate, reverse complement)

## Phase 11: Polish & Optimization
- [ ] Responsive design optimization
- [ ] Loading states and error handling
- [ ] User experience improvements
- [ ] Performance optimization

## Phase 12: Localization (Chinese)
- [x] Localize DashboardLayout navigation menu
- [x] Localize Home/Dashboard page
- [x] Localize NewOrder page
- [x] Localize BatchOrder page
- [x] Localize OrderList page
- [x] Localize OrderDetail page
- [x] Localize VectorLibrary page
- [x] Localize EnzymeList page
- [x] Localize HostSpecies page
- [x] Localize SequenceTools page


## Phase 13: Primer Design Module
- [x] Design primer design algorithm (PCR and sequencing primers)
- [x] Implement primer Tm calculation
- [x] Implement GC content analysis for primers)
- [x] Add primer component annotation (protective bases, restriction sites, annealing regions)
- [x] Create backend API for primer design
- [x] Build primer design UI component
- [x] Integrate primer design into order workflow
- [ ] Add primer export functionality

## Phase 14: DNAWorks Codon Optimization
- [x] Research DNAWorks algorithm implementation
- [x] Implement codon usage table for different host species
- [x] Calculate CAI (Codon Adaptation Index)
- [x] Implement GC content optimization
- [x] Implement restriction site avoidance logic
- [x] Implement repeat sequence detection and elimination
- [x] Create optimization result display with CAI score
- [ ] Add GC content plot visualization
- [x] Integrate with existing order creation workflow

## Phase 15: Plasmid Map Visualization
- [x] Research and select plasmid visualization library
- [x] Implement plasmid map rendering component
- [x] Add feature annotations (promoter, resistance, cloning sites)
- [x] Highlight insert fragment position
- [x] Add interactive features (zoom, rotate, feature selection)
- [x] Integrate into order detail page
- [x] Add export functionality (PNG/SVG)


## Phase 16: Batch Primer Design
- [x] Design batch primer generation API
- [x] Implement Excel export functionality for primers
- [x] Create batch primer design UI page
- [x] Add order selection interface
- [x] Integrate with existing primer design module
- [x] Add download functionality for Excel files

## Phase 17: Internal Workflow Management System
### Database Design
- [x] Design task assignment table
- [x] Design lab group and user role tables
- [x] Design experiment record tables
- [x] Design data flow tracking tables

### Backend APIs
- [ ] Task creation and assignment APIs
- [ ] Task status update APIs
- [ ] Data import/export APIs for each group
- [ ] Experiment record CRUD APIs

### Workstation UIs
- [ ] Order Design Group workstation
- [ ] PCR Amplification Group workstation
- [ ] Ligation & Transformation Group workstation
- [ ] Vector Digestion Group workstation
- [ ] Colony Screening Group workstation
- [ ] Result Processing Group workstation

### Task Management
- [ ] Task list and filtering
- [ ] Task assignment interface
- [ ] Progress tracking dashboard
- [ ] Data flow visualization

## Phase 18: DingTalk OAuth Integration
- [ ] Research DingTalk OAuth API documentation
- [ ] Implement DingTalk OAuth callback handler
- [ ] Add DingTalk login button to login page
- [ ] Sync user information from DingTalk
- [ ] Implement DingTalk message push for order notifications
- [ ] Add DingTalk user profile integration


## Phase 19: DingTalk OAuth Integration (Current)
- [x] Research DingTalk OAuth 2.0 API documentation
- [ ] Register DingTalk application and obtain credentials
- [x] Implement DingTalk OAuth callback handler
- [x] Add DingTalk user info sync
- [x] Create DingTalk login button UI
- [x] Implement DingTalk message notification API
- [x] Add order status change notifications
- [ ] Test DingTalk login flow (requires DingTalk app credentials)
- [ ] Test notification delivery (requires DingTalk webhook configuration)


## Phase 20: VPS Deployment Preparation
- [ ] Create automated deployment script for Ubuntu
- [ ] Prepare Node.js installation script
- [ ] Prepare MySQL database setup script
- [ ] Create database initialization SQL
- [ ] Create Nginx configuration for reverse proxy
- [ ] Prepare SSL certificate setup with Let's Encrypt
- [ ] Create environment variables template
- [ ] Create PM2 ecosystem configuration
- [ ] Write deployment documentation
- [ ] Create deployment troubleshooting guide
- [ ] Package all deployment files


## Phase 21: Unified Order Submission Interface
- [x] Create new unified order submission page combining single and batch orders
- [x] Implement inline spreadsheet editor with editable table
- [x] Add file upload functionality (Excel/CSV import)
- [x] Integrate sequence configuration options (host species, vector, optimization)
- [x] Add enzyme site avoidance/retention configuration
- [x] Implement data validation for table input
- [x] Add clear table and reset functionality
- [x] Update navigation to use new unified interface
- [x] Test single and batch order submission workflows
- [ ] Remove old separate NewOrder and BatchOrder pages (kept for reference)


## Phase 22: Enzyme Multi-Select Enhancement
- [x] Query restriction enzyme list from database
- [x] Implement multi-select dropdown component for enzymes
- [x] Replace "avoid enzymes" text input with multi-select dropdown
- [x] Replace "retain enzymes" text input with multi-select dropdown
- [x] Update order submission logic to handle selected enzyme arrays
- [x] Test enzyme selection and submission workflow
