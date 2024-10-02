import { firestore, database, storage } from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";
import { collection, getDocs, query, where, updateDoc, doc, getDoc, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {ref as storageRef, uploadBytes} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js";
let currentSampleId = null;

// Function to get the current user
export function getCurrentUser() {
    const auth = getAuth();
    return auth.currentUser;
}

// Function to get the full name of the logged-in user from the Realtime Database
async function getUserFullName(userId) {
    const userRef = ref(database, `laboratory_staff/${userId}`);
    const userSnapshot = await get(userRef);
    if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        return `${userData.firstName} ${userData.middleName} ${userData.lastName}`; // Combine names
    } else {
        throw new Error("User data not found in laboratory_staff.");
    }
}

function formatTimestamp(timestamp) {
    // Check if the timestamp is a Firestore server timestamp
    if (timestamp && timestamp.constructor.name === 'Timestamp') {
        // Convert Firestore Timestamp to JavaScript Date
        const date = timestamp.toDate();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    } else if (timestamp) {
        // If it's a normal date, format it
        const date = new Date(timestamp);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
    return 'Invalid Date';
}


// Define a variable to store userFullName in a higher scope
let userFullName = '';
let selectedRequestId = null; // Variable to hold the selected request ID

// Function to fetch all assigned tasks for the user
async function fetchAssignedTasks(userFullName) {
    const taskTableBody = document.getElementById('taskTableBody');
    taskTableBody.innerHTML = ''; // Clear previous content

    const appointmentsRef = collection(firestore, 'appointments');
    const appointmentsQuery = query(appointmentsRef, where('assignedStaff', '==', userFullName));
    const appointmentsSnapshot = await getDocs(appointmentsQuery);

    // Check if there are appointments for the user
    if (appointmentsSnapshot.empty) {
        taskTableBody.innerHTML = '<tr><td colspan="8">No assigned tasks available.</td></tr>';
        return;
    }

    for (const appointmentDoc of appointmentsSnapshot.docs) {
        const appointmentData = appointmentDoc.data();
        const requestId = appointmentData.requestId;

        // Fetch the corresponding request document
        const requestSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', requestId)));
        const requestData = requestSnapshot.empty ? {} : requestSnapshot.docs[0].data();

        const excludedStatuses = [
            'releasing',
            'rejected',
            'verifying',
            'inspecting',
            'reporting',
            'initiating',
            'drafting',
            'approving',
            'signing',
            'managing'
        ];
        
        // Check if the status is in the excluded statuses
        if (excludedStatuses.includes(requestData.request_status)) {
            continue;
        }

        const row = `
            <tr>
                <td>${appointmentData.endDate ? new Date(appointmentData.endDate).toLocaleDateString() : 'N/A'}</td>
                <td>${requestId}</td>
                <td>${requestData.requestOption || 'N/A'}</td>
                <td>${appointmentData.clientType || 'N/A'}</td>
                <td>${appointmentData.requesterName || 'N/A'}</td>
                <td>${requestData.samples ? requestData.samples.length : 0}</td>
                <td>${appointmentData.priorityLevel || 'N/A'}</td>
                <td>${requestData.request_status || 'N/A'}</td>
            </tr>
        `;
        taskTableBody.innerHTML += row; // Append new row to the all assigned tasks table
    }
}

document.getElementById('backToTasksButton').addEventListener('click', () => {
    document.getElementById('taskDetailsSection').style.display = 'none';
    document.getElementById('ongoing').style.display = 'block';
    taskList.style.display = 'block';
});

let selectedRequestIdPass = null;

document.getElementById('createReportButton').addEventListener('click', async () => {
    document.getElementById('taskDetailsSection').style.display = 'none';

    if (!selectedRequestIdPass) {
        console.error('No selectedRequestId. Please select a request.');
        return;
    }

    console.log('Fetching data for Request ID:', selectedRequestIdPass);

    const appointmentsSnapshot = await getDocs(query(collection(firestore, 'appointments'), where('requestId', '==', selectedRequestIdPass)));
    const appointmentData = appointmentsSnapshot.empty ? null : appointmentsSnapshot.docs[0].data();

    if (!appointmentData) {
        console.error('No appointment data found.');
        return;
    }

    const requestsSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', selectedRequestIdPass)));
    const requestData = requestsSnapshot.empty ? null : requestsSnapshot.docs[0].data();

    if (!requestData) {
        console.error('No request data found.');
        return;
    }

    const requestId = requestData.requestId || appointmentData.requestId;

    if (!requestId) {
        console.error('No requestId found in fetched data');
        return;
    }

    console.log('Request ID from fetched data:', requestId);

    const reportHeader = `
        <h2>Report's Details</h2>
        <table>
            <tr><th>Requester Name:</th><td>${appointmentData.requesterName || 'N/A'}</td></tr>
            <tr><th>Request ID:</th><td>${requestId}</td></tr>
            <tr><th>Appointed At:</th><td>${formatTimestamp(appointmentData.createdAt) || 'N/A'}</td></tr>
            <tr><th>Priority Level:</th><td>${appointmentData.priorityLevel || 'N/A'}</td></tr>
        </table>
    `;

    const reportsSnapshot = await getDocs(query(collection(firestore, 'reports'), where('requestId', '==', requestId)));

    let reportSummary = `<h3>Report Summary</h3>`;
    if (!reportsSnapshot.empty) {
        reportSummary += `<ul>`;
        reportsSnapshot.docs.forEach(doc => {
            const reportData = doc.data();
            let reportContent = `<li><strong>Report:</strong><ul>`;

            Object.keys(reportData).forEach(key => {
                let value = reportData[key];

                if (value instanceof Timestamp) {
                    value = formatTimestamp(value);
                }

                reportContent += `<li><strong>${key}:</strong> ${value || 'N/A'}</li>`;
            });

            reportContent += `</ul></li>`;
            reportSummary += reportContent;
        });
        reportSummary += `</ul>`;
    } else {
        reportSummary += `<p>No reports found for this request ID.</p>`;
    }

    const fullReport = reportHeader + reportSummary + `
        <button id="backButton">Back</button>
        <button id="sendButton">Send</button>
    `;

    const reportContainer = document.getElementById('reportContainer');
    reportContainer.innerHTML = fullReport;
    reportContainer.style.display = 'block';

    document.getElementById('ongoing').style.display = 'none';
    document.getElementById('taskList').style.display = 'none';

    // Back button functionality
    document.getElementById('backButton').addEventListener('click', () => {
        reportContainer.style.display = 'none';
        document.getElementById('ongoing').style.display = 'block';
        document.getElementById('taskList').style.display = 'block';
    });

    // Move the send button functionality here
    document.getElementById('sendButton').addEventListener('click', async () => {
        try {
            const { jsPDF } = window.jspdf;
            const pdfDoc = new jsPDF();

            // Adding report details
            pdfDoc.setFontSize(12);
            pdfDoc.text('Report\'s Details', 10, 10);
            pdfDoc.autoTable({
                head: [['Requester Name', 'Request ID', 'Appointed At', 'Priority Level', 'Submitted by']],
                body: [[
                    appointmentData.requesterName || 'N/A',
                    requestId,
                    formatTimestamp(appointmentData.createdAt) || 'N/A',
                    appointmentData.priorityLevel || 'N/A',
                    appointmentData.assignedStaff
                ]],
                startY: 20
            });

            // Adding report summary
            const reportsSnapshot = await getDocs(query(collection(firestore, 'reports'), where('requestId', '==', requestId)));

            let reportSummary = 'Report Summary:\n\n';
            if (!reportsSnapshot.empty) {
                reportsSnapshot.docs.forEach(doc => {
                    const reportData = doc.data();
                    reportSummary += `Report:\n`;

                    // Loop through keys and dynamically create the report fields
                    Object.keys(reportData).forEach(key => {
                        let value = reportData[key];

                        // Check if the value is a Firestore Timestamp and format it
                        if (value instanceof Timestamp) {
                            value = formatTimestamp(value); // Convert Firestore Timestamp to readable format
                        }

                        reportSummary += `  - ${key}: ${value || 'N/A'}\n`;
                    });
                    reportSummary += '\n';
                });
            } else {
                reportSummary += 'No reports found for this request ID.\n';
            }

            // Add report summary to the PDF
            pdfDoc.text(reportSummary, 10, pdfDoc.autoTable.previous.finalY + 10);

            // Save PDF to a blob
            const pdfBlob = pdfDoc.output('blob');
    
            // Upload PDF to Firebase Storage in 'reports' folder
            const pdfStorageRef = storageRef(storage, `reports/report_${requestId}.pdf`); // Create a reference for the file
            await uploadBytes(pdfStorageRef, pdfBlob); // Use uploadBytes instead of put
    
            const user = getCurrentUser(); // Use the getCurrentUser() function
            if (!user) {
                throw new Error('No user logged in.');
            }
            const userId = user.uid;
    
            // Add to the notifications collection
            await addDoc(collection(firestore, 'notifications'), {
                message: `The report for request: ${requestId} is now submitted. Please review for approval.`,
                timestamp: new Date().toISOString(),
                userId: userId
            });
    
            // Add to the analysisreport collection
            await addDoc(collection(firestore, 'analysisreport'), {
                message: `The report done by ${appointmentData.assignedStaff || 'N/A'} has been released already and is waiting for validation.`,
                timestamp: new Date().toISOString(),
                userId: userId,
                requestId: requestId
            });

            const requestsRef = collection(firestore, 'requests');
            const requestQuery = query(requestsRef, where('requestId', '==', requestId));
            const requestSnapshot = await getDocs(requestQuery);

            // Check if a request document exists
            if (!requestSnapshot.empty) {
                const requestDocRef = requestSnapshot.docs[0].ref; // Get the reference of the first document

                // Fetch the document data to check the current status
                const requestDoc = requestSnapshot.docs[0].data(); // Get the data from the document

                let updatedStatus = 'testing'; // Default status for approval

                // Conditional logic based on current request_status
                if (requestDoc.request_status === 'verifying') {
                    updatedStatus = 'checking';
                } else if (requestDoc.request_status === 'inspecting') {
                    updatedStatus = 'reporting';
                }

                // Update request status based on the evaluated status
                await updateDoc(requestDocRef, { request_status: updatedStatus });
                console.log(`Request status updated to: ${updatedStatus}`);
            } else {
                console.log('No request found with the specified requestId.');
            }

            alert('Report sent and saved to Firebase Storage successfully!');
            reportContainer.style.display = 'none';
            document.getElementById('ongoing').style.display = 'block';
            document.getElementById('taskList').style.display = 'block';
        } catch (error) {
            console.error('Error generating or uploading PDF:', error);
            alert('An error occurred while sending the report. Please try again.');
        }
    });
    
});

async function showTaskDetails(requestId) {
    try {
        // Fetch appointment details using requestId
        const appointmentsSnapshot = await getDocs(query(collection(firestore, 'appointments'), where('requestId', '==', requestId)));
        const appointmentData = appointmentsSnapshot.empty ? null : appointmentsSnapshot.docs[0].data();

        // Fetch request details using requestId
        const requestsSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', requestId)));
        const requestData = requestsSnapshot.empty ? null : requestsSnapshot.docs[0].data();

        // If no appointment or request data is found, show an error message
        if (!appointmentData || !requestData) {
            alert('No details found for this request ID.');
            return;
        }

        // Hide the ongoing tasks and show the task details section
        taskList.style.display = 'none';
        document.getElementById('ongoing').style.display = 'none';
        document.getElementById('taskDetailsSection').style.display = 'block';

        // Fill in the task details header
        document.getElementById('taskHeader').innerHTML = `
            Requester Name: ${appointmentData.requesterName || 'N/A'} <br>
            Request ID: ${requestId} <br>
            Appointed At: ${formatTimestamp(appointmentData.createdAt) || 'N/A'} <br>
            Priority Level: ${appointmentData.priorityLevel || 'N/A'}
        `;

        // Populate the samples table
        const sampleTableBody = document.getElementById('sampleTableBody');
        sampleTableBody.innerHTML = ''; // Clear previous content

        if (requestData.samples && requestData.samples.length > 0) {
            requestData.samples.forEach((sample, index) => {
                const row = `
                    <tr>
                        <td>${index + 1}</td>   
                        <td>${sample.status || 'In Progress'}</td>
                        <td>
                            <button class="btn-samplereport" data-sample-id="${sample.sampleId}">Report</button>
                            ${['plateCount', 'microbialWaterAnalysis'].includes(requestData.requestOption) ? '<button class="btn-count-colonies">Count Colonies</button>' : ''}
                        </td>
                    </tr>
                `;
                sampleTableBody.innerHTML += row;
            });
        } else {
            const row = `
                <tr>
                    <td>EQUIPMENT</td> <!-- Adjust the sample number as needed -->
                    <td>${requestData.equipmentRequesting}</td>
                    <td>${requestData.equipmentStatus || 'In Progress'}</td>
                    <td>
                        <button class="btn-samplereport" data-sample-id="${requestData.equipmentId}">Report</button>
                    </td>
                </tr>
            `;
            sampleTableBody.innerHTML += row;
        }

        // Attach event listeners to the report and count colonies buttons
        document.querySelectorAll('.btn-samplereport').forEach(button => {
            button.addEventListener('click', (event) => {
                const sampleId = event.currentTarget.getAttribute('data-sample-id'); 
                const requestOption = requestData.requestOption;
                const requestId = requestData.requestId;

                currentSampleId = sampleId; 

                showReportForm(requestOption, requestId);
            });
        });

        document.querySelectorAll('.btn-count-colonies').forEach(button => {
            button.addEventListener('click', () => {
                alert('Count colonies action clicked');
                document.getElementById('taskDetailsSection').style.display = 'none';
                document.getElementById('colonyCountSection').style.display = 'block';
            });
        });
    } catch (error) {
        console.error('Error fetching task details:', error);
        alert('An error occurred while fetching task details. Please try again later.');
    }
}

async function saveReportToFirestore(requestData, formData) {
    try {
        // Ensure requestData is valid
        if (!requestData || !requestData.requestId) {
            alert('Invalid request data. Please try again.');
            return; // Exit the function if data is invalid
        }

        const reportsCollection = collection(firestore, 'reports');

        // Check if the collection exists by querying for any documents
        const reportsSnapshot = await getDocs(reportsCollection);

        // If no documents exist in the collection, you can handle it if needed
        if (reportsSnapshot.empty) {
            console.log('Reports collection is empty. A new document will be added.');
        }

        // Prepare the report data
        const reportData = {
            requestId: requestData.requestId, // Save the requestId
            reportDate: new Date(), // Automatically set the report date
            ...formData // Spread formData which contains the dynamic form fields
        };

        // Add the reportData to Firestore
        await addDoc(reportsCollection, reportData);
        alert('Report saved successfully!');
    } catch (error) {
        console.error('Error saving report:', error);
        alert('An error occurred while saving the report. Please try again later.');
    }
}

async function updateRequestInFirestore(requestId, updatedData) {
    try {
        // Create a reference to the requests collection
        const requestsCollection = collection(firestore, 'requests');

        // Query to find the document with the matching requestId
        const q = query(requestsCollection, where('requestId', '==', requestId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            throw new Error('No document found for the specified requestId.');
        }

        // Assuming only one document will match
        for (const docSnapshot of querySnapshot.docs) {
            const requestDocRef = doc(firestore, `requests/${docSnapshot.id}`);

            // Check for undefined values before updating
            console.log('Before update:', updatedData);
            Object.entries(updatedData).forEach(([key, value]) => {
                if (value === undefined) {
                    console.warn(`Field "${key}" is undefined. Update might fail.`);
                }
            });

            // Update the document with the new data
            await updateDoc(requestDocRef, updatedData);
            console.log('Request data updated successfully!');
        }
    } catch (error) {
        console.error('Error updating request data in Firestore:', error);
        throw error; // Re-throw the error to handle it elsewhere if needed
    }
}


function showReportForm(requestOption, requestId) {
    const reportFormContainer = document.getElementById('reportFormContainer');
    reportFormContainer.innerHTML = ''; // Clear the previous form

    // Show the report form based on the requestOption using if-else structure
    if (requestOption === 'plateCount') {
        reportFormContainer.innerHTML = `
            <h3>Plate Count Report</h3>
            <form>
                <label for="dilutionSeries">Dilution Series Used:</label>
                <input type="text" id="dilutionSeries" name="dilutionSeries" placeholder="Enter Dilution Series"><br>
                <label for="incubationConditions">Incubation Conditions:</label>
                <input type="text" id="incubationConditions" name="incubationConditions" placeholder="Enter Incubation Conditions"><br>
                <label for="colonyCount">Colony Count (CFUs):</label>
                <input type="text" id="colonyCount" name="colonyCount" placeholder="Enter Colony Count"><br>
                <label for="cfusCalculation">CFUs/mL Calculation:</label>
                <input type="text" id="cfusCalculation" name="cfusCalculation" placeholder="Enter CFUs/mL Calculation"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'agarDiscDiffusion') {
        reportFormContainer.innerHTML = `
            <h3>Agar Disc Diffusion Report</h3>
            <form>
                <label for="testSubstance">Test Substance:</label>
                <input type="text" id="testSubstance" name="testSubstance" placeholder="Enter Test Substance"><br>
                <label for="discConcentration">Disc Concentration:</label>
                <input type="text" id="discConcentration" name="discConcentration" placeholder="Enter Disc Concentration"><br>
                <label for="incubationConditions">Incubation Conditions:</label>
                <input type="text" id="incubationConditions" name="incubationConditions" placeholder="Enter Incubation Conditions"><br>
                <label for="zoneOfInhibition">Zone of Inhibition (mm):</label>
                <input type="text" id="zoneOfInhibition" name="zoneOfInhibition" placeholder="Enter Zone of Inhibition"><br>
                <label for="interpretation">Interpretation:</label>
                <input type="text" id="interpretation" name="interpretation" placeholder="Enter Interpretation"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'agarWellDiffusion') {
        reportFormContainer.innerHTML = `
            <h3>Agar Well Diffusion Report</h3>
            <form>
                <label for="testSubstance">Test Substance:</label>
                <input type="text" id="testSubstance" name="testSubstance" placeholder="Enter Test Substance"><br>
                <label for="wellVolume">Well Volume:</label>
                <input type="text" id="wellVolume" name="wellVolume" placeholder="Enter Well Volume"><br>
                <label for="incubationConditions">Incubation Conditions:</label>
                <input type="text" id="incubationConditions" name="incubationConditions" placeholder="Enter Incubation Conditions"><br>
                <label for="zoneOfInhibition">Zone of Inhibition (mm):</label>
                <input type="text" id="zoneOfInhibition" name="zoneOfInhibition" placeholder="Enter Zone of Inhibition"><br>
                <label for="interpretation">Interpretation:</label>
                <input type="text" id="interpretation" name="interpretation" placeholder="Enter Interpretation"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'micTesting') {
        reportFormContainer.innerHTML = `
            <h3>MIC Testing Report</h3>
            <form>
                <label for="antimicrobialAgent">Antimicrobial Agent:</label>
                <input type="text" id="antimicrobialAgent" name="antimicrobialAgent" placeholder="Enter Antimicrobial Agent"><br>
                <label for="dilutionSeries">Dilution Series:</label>
                <input type="text" id="dilutionSeries" name="dilutionSeries" placeholder="Enter Dilution Series"><br>
                <label for="incubationConditions">Incubation Conditions:</label>
                <input type="text" id="incubationConditions" name="incubationConditions" placeholder="Enter Incubation Conditions"><br>
                <label for="micValue">MIC Value (µg/mL):</label>
                <input type="text" id="micValue" name="micValue" placeholder="Enter MIC Value"><br>
                <label for="interpretation">Interpretation:</label>
                <input type="text" id="interpretation" name="interpretation" placeholder="Enter Interpretation"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'mbcTesting') {
        reportFormContainer.innerHTML = `
            <h3>MBC Testing Report</h3>
            <form>
                <label for="antimicrobialAgent">Antimicrobial Agent:</label>
                <input type="text" id="antimicrobialAgent" name="antimicrobialAgent" placeholder="Enter Antimicrobial Agent"><br>
                <label for="subculturingDate">Subculturing Date:</label>
                <input type="text" id="subculturingDate" name="subculturingDate" placeholder="Enter Subculturing Date"><br>
                <label for="incubationConditions">Incubation Conditions:</label>
                <input type="text" id="incubationConditions" name="incubationConditions" placeholder="Enter Incubation Conditions"><br>
                <label for="mbcValue">MBC Value (µg/mL):</label>
                <input type="text" id="mbcValue" name="mbcValue" placeholder="Enter MBC Value"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'microbialWaterAnalysis') {
        reportFormContainer.innerHTML = `
            <h3>Water Analysis Report</h3>
            <form>
                <label for="filtrationMethod">Filtration/Plating Method:</label>
                <input type="text" id="filtrationMethod" name="filtrationMethod" placeholder="Enter Filtration Method"><br>
                <label for="selectiveMedia">Selective Media Used:</label>
                <input type="text" id="selectiveMediaUsed" name="selectiveMedia" placeholder="Enter Selective Media"><br>
                <label for="incubationConditions">Incubation Conditions:</label>
                <input type="text" id="incubationConditions" name="incubationConditions" placeholder="Enter Incubation Conditions"><br>
                <label for="colonyCount">Colony Count (CFUs):</label>
                <input type="text" id="colonyCount" name="colonyCount" placeholder="Enter Colony Count"><br>
                <label for="microbeIdentified">Microbe Identified:</label>
                <input type="text" id="microbeIdentified" name="microbeIdentified" placeholder="Enter Microbe Identified"><br>
                <label for="confirmationTest">Confirmation Test Results:</label>
                <input type="text" id="confirmationTestResults" name="confirmationTest" placeholder="Enter Confirmation Test Results"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'microbialCharacterization') {
        reportFormContainer.innerHTML = `
            <h3>Microbial Characterization Report</h3>
            <form>
                <label for="biochemicalTests">Biochemical Tests Conducted:</label>
                <input type="text" id="biochemicalTests" name="biochemicalTests" placeholder="Enter Biochemical Tests"><br>
                <label for="molecularIdentification">Molecular Identification (16S rRNA):</label>
                <input type="text" id="molecularIdentification" name="molecularIdentification" placeholder="Enter Molecular Identification"><br>
                <label for="antibioticSusceptibility">Antibiotic Susceptibility:</label>
                <input type="text" id="antibioticSusceptibility" name="antibioticSusceptibility" placeholder="Enter Antibiotic Susceptibility"><br>
                <label for="pupmcc">Included in PUPMCC (yes/no):</label>
                <input type="text" id="pupmcc" name="pupmcc" placeholder="Yes or No"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'microbialCultureCollections') {
        reportFormContainer.innerHTML = `
            <h3>Microbial Culture Collections Report</h3>
            <form>
                <label for="characterizationStatus">Characterization Status:</label>
                <input type="text" id="characterizationStatus" name="characterizationStatus" placeholder="Enter Characterization Status"><br>
                <label for="preservationDate">Preservation Date:</label>
                <input type="text" id="preservationDate" name="preservationDate" placeholder="Enter Preservation Date"><br>
                <label for="catalogNumber">Catalog Number:</label>
                <input type="text" id="catalogNumber" name="catalogNumber" placeholder="Enter Catalog Number"><br>
                <label for="accessProvided">Access Provided (yes/no):</label>
                <input type="text" id="accessProvided" name="accessProvided" placeholder="Yes or No"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'microscopy') {
        reportFormContainer.innerHTML = `
            <h3>Microscopy Report</h3>
            <form>
                <label for="stainingMethod">Staining Method:</label>
                <input type="text" id="stainingMethod" name="stainingMethod" placeholder="Enter Staining Method"><br>
                <label for="magnificationUsed">Magnification Used:</label>
                <input type="text" id="magnificationUsed" name="magnificationUsed" placeholder="Enter Magnification Used"><br>
                <label for="morphologicalObservations">Morphological Observations:</label>
                <input type="text" id="morphologicalObservations" name="morphologicalObservations" placeholder="Enter Morphological Observations"><br>
                <label for="photomicrographyDone">Photomicrography Done:</label>
                <input type="text" id="photomicrographyDone" name="photomicrographyDone" placeholder="Yes or No"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else if (requestOption === 'plantSpeciesIdentification') {
        reportFormContainer.innerHTML = `
            <h3>Plant Species Identification Report</h3>
            <form>
                <label for="plantSpecimen">Plant Specimen:</label>
                <input type="text" id="plantSpecimen" name="plantSpecimen" placeholder="Enter Plant Specimen"><br>
                <label for="identificationStatus">Identification Status:</label>
                <input type="text" id="identificationStatus" name="identificationStatus" placeholder="Enter Identification Status"><br>
                <label for="accessionNumber">Accession Number:</label>
                <input type="text" id="accessionNumber" name="accessionNumber" placeholder="Enter Accession Number"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    } else {
        // Default form for any other request options
        reportFormContainer.innerHTML = `
            <h3>Equipment Report</h3>
            <form>
                <label for="equipmentRequested">Equipment Requested:</label>
                <input type="text" id="equipmentRequested" name="equipmentRequested" placeholder="Enter Equipment Requested"><br>
                <label for="scheduledUseDate">Scheduled Use Date:</label>
                <input type="text" id="scheduledUseDate" name="scheduledUseDate" placeholder="Enter Scheduled Use Date"><br>
                <label for="postUseCondition">Post-Use Condition:</label>
                <input type="text" id="postUseCondition" name="postUseCondition" placeholder="Enter Post-Use Condition"><br>
                <label for="notes">Notes:</label>
                <textarea id="notes" name="notes" placeholder="Enter Notes"></textarea><br>
                <button type="button" class="btn-done">Done</button>
            </form>
            <button id="backButton">Back</button>
        `;
    }

    // Show the report form
    document.getElementById('taskDetailsSection').style.display = 'none';
    reportFormContainer.style.display = 'block';

    const backButton = document.getElementById('backButton');
    backButton.addEventListener('click', () => {
        reportFormContainer.style.display = 'none';
        document.getElementById('taskDetailsSection').style.display = 'block'; // Show the task details section again
    });

    // Add event listener for Done button
    document.querySelector('.btn-done').addEventListener('click', async () => {
        // Collect form data
        const formData = {};

        const requestData = {
            reportType: requestOption,
            requestId: requestId
          };
    
        if (requestOption === 'plateCount') {
            formData.dilutionSeries = document.getElementById('dilutionSeries').value;
            formData.incubationConditions = document.getElementById('incubationConditions').value;
            formData.colonyCount = document.getElementById('colonyCount').value;
            formData.cfuCalculation = document.getElementById('cfuCalculation').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'agarDiscDiffusion') {
            formData.testSubstance = document.getElementById('testSubstance').value;
            formData.discConcentration = document.getElementById('discConcentration').value;
            formData.incubationConditions = document.getElementById('incubationConditions').value;
            formData.zoneOfInhibition = document.getElementById('zoneOfInhibition').value;
            formData.interpretation = document.getElementById('interpretation').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'agarWellDiffusion') {
            formData.testSubstance = document.getElementById('testSubstance').value;
            formData.wellVolume = document.getElementById('wellVolume').value;
            formData.incubationConditions = document.getElementById('incubationConditions').value;
            formData.zoneOfInhibition = document.getElementById('zoneOfInhibition').value;
            formData.interpretation = document.getElementById('interpretation').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'micTesting') {
            formData.antimicrobialAgent = document.getElementById('antimicrobialAgent').value;
            formData.dilutionSeries = document.getElementById('dilutionSeries').value;
            formData.incubationConditions = document.getElementById('incubationConditions').value;
            formData.micValue = document.getElementById('micValue').value;
            formData.interpretation = document.getElementById('interpretation').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'mbcTesting') {
            formData.antimicrobialAgent = document.getElementById('antimicrobialAgent').value;
            formData.subculturingDate = document.getElementById('subculturingDate').value;
            formData.incubationConditions = document.getElementById('incubationConditions').value;
            formData.mbcValue = document.getElementById('mbcValue').value;
            formData.interpretation = document.getElementById('interpretation').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'microbialWaterAnalysis') {
            formData.filtrationMethod = document.getElementById('filtrationMethod').value;
            formData.selectiveMediaUsed = document.getElementById('selectiveMediaUsed').value;
            formData.incubationConditions = document.getElementById('incubationConditions').value;
            formData.colonyCount = document.getElementById('colonyCount').value;
            formData.microbeIdentified = document.getElementById('microbeIdentified').value;
            formData.confirmationTestResults = document.getElementById('confirmationTestResults').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'microbialCharacterization') {
            formData.biochemicalTests = document.getElementById('biochemicalTests').value;
            formData.molecularIdentification = document.getElementById('molecularIdentification').value;
            formData.antibioticSusceptibility = document.getElementById('antibioticSusceptibility').value;
            formData.includedInPUPMCC = document.getElementById('pupmcc').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'microbialCultureCollections') {
            formData.characterizationStatus = document.getElementById('characterizationStatus').value;
            formData.preservationDate = document.getElementById('preservationDate').value;
            formData.catalogNumber = document.getElementById('catalogNumber').value;
            formData.accessProvided = document.getElementById('accessProvided').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'microscopy') {
            formData.stainingMethod = document.getElementById('stainingMethod').value;
            formData.magnificationUsed = document.getElementById('magnificationUsed').value;
            formData.morphologicalObservations = document.getElementById('morphologicalObservations').value;
            formData.photomicrographyDone = document.getElementById('photomicrographyDone').value;
            formData.notes = document.getElementById('notes').value;
        } else if (requestOption === 'plantSpeciesIdentification') {
            formData.plantSpecimen = document.getElementById('plantSpecimen').value;
            formData.identificationStatus = document.getElementById('identificationStatus').value;
            formData.accessionNumber = document.getElementById('accessionNumber').value;
            formData.notes = document.getElementById('notes').value;
        } else {
            // Default case for equipment requests
            formData.equipmentRequested = document.getElementById('equipmentRequested').value;
            formData.scheduledUseDate = document.getElementById('scheduledUseDate').value;
            formData.postUseCondition = document.getElementById('postUseCondition').value;
            formData.notes = document.getElementById('notes').value;
        }

        console.log("Request Data:", requestData);
        console.log("Form Data:", formData);

        // Save to Firestore
        await saveReportToFirestore(requestData, formData);

        const requestsSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', requestId)));
        const requestDataFromFirestore = requestsSnapshot.empty ? null : requestsSnapshot.docs[0].data();
        
        // Check if samples exist and initialize them
        if (requestDataFromFirestore && requestDataFromFirestore.samples) {
            requestData.samples = requestDataFromFirestore.samples; // Assign samples from Firestore
        } else {
            requestData.samples = []; // Initialize samples as an empty array if none exist
        }
        
        // Check if equipmentId is present
        if (requestDataFromFirestore && requestDataFromFirestore.equipmentId) {
            // Prepare updated data with equipmentStatus
            const updatedData = {
                equipmentStatus: 'Done', // Set equipmentStatus
            };
        
            // Log updated data to ensure it's not undefined
            console.log('Updated Data:', updatedData);
        
            // Update Firestore
            await updateRequestInFirestore(requestData.requestId, updatedData);
        } else if (requestData.samples && requestData.samples.length > 0) {
            // Collect sample data
            const sampleIdToUpdate = currentSampleId; // Ensure this is defined
            console.log("Current Sample ID:", sampleIdToUpdate);
            console.log("Samples Array:", requestData.samples); // Log the samples array
        
            // Find the sample with the matching sampleId and update its status
            const sampleToUpdate = requestData.samples.find(sample => sample.sampleId === sampleIdToUpdate);
            if (sampleToUpdate) {
                sampleToUpdate.status = 'Done'; // Set the status to 'Done'
                console.log(`Sample with ID ${sampleIdToUpdate} updated to Done.`);
            } else {
                console.error(`Sample with ID ${sampleIdToUpdate} not found.`);
            }
        
            // Prepare updated data
            const updatedData = {
                samples: requestData.samples // Include the updated samples array
            };
        
            // Log updated data to ensure it's not undefined
            console.log('Updated Data:', updatedData);
        
            // Update Firestore
            await updateRequestInFirestore(requestData.requestId, updatedData);
        } else {
            console.warn("No samples to update.");
        }

        // Hide the report form and show the taskDetailsSection again
        reportFormContainer.style.display = 'none';
        document.getElementById('taskDetailsSection').style.display = 'block';
    });
    
}

// Function to fetch ongoing tasks
async function fetchOngoingTasks(userFullName, filterCriteria = {}) {
    const ongoingTaskTableBody = document.getElementById('ongoingTaskTableBody');
    ongoingTaskTableBody.innerHTML = ''; // Clear previous content

    const appointmentsRef = collection(firestore, 'appointments');
    const appointmentsQuery = query(appointmentsRef, where('assignedStaff', '==', userFullName));
    const appointmentsSnapshot = await getDocs(appointmentsQuery);

    // Check if there are appointments for the user
    if (appointmentsSnapshot.empty) {
        ongoingTaskTableBody.innerHTML = '<tr><td colspan="8">No ongoing tasks available.</td></tr>';
        return;
    }

    for (const appointmentDoc of appointmentsSnapshot.docs) {
        const appointmentData = appointmentDoc.data();
        const requestId = appointmentData.requestId;

        // Fetch the corresponding request document
        const requestSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', requestId)));
        const requestData = requestSnapshot.empty ? {} : requestSnapshot.docs[0].data();

        if (['releasing', 'rejected', 'analysing', 'scheduling', 'preparing'].includes(requestData.request_status)) {
            continue;
        }

        // Check filtering criteria
        const matchesFilter =
            (filterCriteria.requestType ? requestData.requestType === filterCriteria.requestType : true) &&
            (filterCriteria.priorityLevel ? appointmentData.priorityLevel === filterCriteria.priorityLevel : true);

        if (matchesFilter) {
            const row = `
            <tr data-request-id="${requestId}" class="ongoing-task-row">
                <td>${appointmentData.endDate ? new Date(appointmentData.endDate).toLocaleDateString() : 'N/A'}</td>
                <td>${requestId}</td>
                <td>${appointmentData.requestType || 'N/A'}</td>
                <td>${appointmentData.clientType || 'N/A'}</td>
                <td>${appointmentData.requesterName || 'N/A'}</td>
                <td>${requestData.samples ? requestData.samples.length : 0}</td>
                <td>${appointmentData.priorityLevel || 'N/A'}</td>
                <td>${requestData.request_status || 'N/A'}</td>
            </tr>
        `;

            ongoingTaskTableBody.innerHTML += row; // Append new row to the ongoing tasks table
        }
    }
    // Attach the event listener to the ongoing task table body
    ongoingTaskTableBody.addEventListener('click', function (event) {
        const row = event.target.closest('tr'); // Get the closest row
        if (row) {
            const cells = row.getElementsByTagName('td'); // Get all cells in the row
            const requestIdCell = cells[1]; // Assuming the Request ID is the second column (index 1)
            const requestId = requestIdCell.textContent; // Get the text content of the Request ID cell
            console.log("Request ID:", requestId); // Log the requestId
            
            selectedRequestIdPass = requestId // Trim whitespace

            console.log('Selected Request ID:', selectedRequestIdPass); // Debugging log

            showTaskDetails(requestId);
        }
    });    

}

// Function to fetch processed tasks with filtering
async function fetchProcessedTasks(userFullName, filterCriteria = {}) {
    const processedTaskTableBody = document.getElementById('processedTaskTableBody');
    processedTaskTableBody.innerHTML = ''; // Clear previous content

    const appointmentsRef = collection(firestore, 'appointments');
    const appointmentsQuery = query(appointmentsRef, where('assignedStaff', '==', userFullName));
    const appointmentsSnapshot = await getDocs(appointmentsQuery);

    // Check if there are appointments for the user
    if (appointmentsSnapshot.empty) {
        processedTaskTableBody.innerHTML = '<tr><td colspan="8">No processed tasks available.</td></tr>';
        return;
    }

    for (const appointmentDoc of appointmentsSnapshot.docs) {
        const appointmentData = appointmentDoc.data();
        const requestId = appointmentData.requestId;

        // Fetch the corresponding request document
        const requestSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', requestId)));
        const requestData = requestSnapshot.empty ? {} : requestSnapshot.docs[0].data();

        if (!['releasing', 'checking','reporting'].includes(requestData.request_status)) {
            continue; // Only include tasks with 'completed' or 'approved' status
        }

        // Check if appointment matches the filter criteria
        const matchesFilter =
            (filterCriteria.requestType ? appointmentData.requestType === filterCriteria.requestType : true) &&
            (filterCriteria.priorityLevel ? appointmentData.priorityLevel === filterCriteria.priorityLevel : true);

        if (!matchesFilter) {
            continue; // Skip if it doesn't match the filter
        }

        const row = `
            <tr>
                <td>${appointmentData.endDate ? new Date(appointmentData.endDate).toLocaleDateString() : 'N/A'}</td>
                <td>${requestId}</td>
                <td>${requestData.requestOption || 'N/A'}</td>
                <td>${appointmentData.clientType || 'N/A'}</td>
                <td>${appointmentData.requesterName || 'N/A'}</td>
                <td>${requestData.samples ? requestData.samples.length : 0}</td>
                <td>${appointmentData.priorityLevel || 'N/A'}</td>
                <td>${requestData.request_status || 'N/A'}</td>
            </tr>
        `;
        processedTaskTableBody.innerHTML += row; // Append new row to the processed tasks table
    }
}

// Function to fetch rejected tasks with filtering
async function fetchRejectedTasks(userFullName, filterCriteria = {}) {
    const rejectedTaskTableBody = document.getElementById('rejectedTaskTableBody');
    rejectedTaskTableBody.innerHTML = ''; // Clear previous content

    const appointmentsRef = collection(firestore, 'appointments');
    const appointmentsQuery = query(appointmentsRef, where('assignedStaff', '==', userFullName));
    const appointmentsSnapshot = await getDocs(appointmentsQuery);

    // Check if there are appointments for the user
    if (appointmentsSnapshot.empty) {
        rejectedTaskTableBody.innerHTML = '<tr><td colspan="8">No rejected tasks available.</td></tr>';
        return;
    }

    for (const appointmentDoc of appointmentsSnapshot.docs) {
        const appointmentData = appointmentDoc.data();
        const requestId = appointmentData.requestId;

        // Fetch the corresponding request document
        const requestSnapshot = await getDocs(query(collection(firestore, 'requests'), where('requestId', '==', requestId)));
        const requestData = requestSnapshot.empty ? {} : requestSnapshot.docs[0].data();

        if (requestData.request_status !== 'rejected') {
            continue; // Only include tasks with 'rejected' status
        }

        // Check if appointment matches the filter criteria
        const matchesFilter =
            (filterCriteria.requestType ? appointmentData.requestType === filterCriteria.requestType : true) &&
            (filterCriteria.priorityLevel ? appointmentData.priorityLevel === filterCriteria.priorityLevel : true);

        if (!matchesFilter) {
            continue; // Skip if it doesn't match the filter
        }

        const row = `
            <tr>
                <td>${appointmentData.endDate ? new Date(appointmentData.endDate).toLocaleDateString() : 'N/A'}</td>
                <td>${requestId}</td>
                <td>${requestData.requestOption || 'N/A'}</td>
                <td>${appointmentData.clientType || 'N/A'}</td>
                <td>${appointmentData.requesterName || 'N/A'}</td>
                <td>${requestData.samples ? requestData.samples.length : 0}</td>
                <td>${appointmentData.priorityLevel || 'N/A'}</td>
                <td>${requestData.request_status || 'N/A'}</td>
            </tr>
        `;
        rejectedTaskTableBody.innerHTML += row; // Append new row to the rejected tasks table
    }

    rejectedTaskTableBody.addEventListener('click', function (event) {
        const row = event.target.closest('tr'); // Get the closest row
        if (row) {
            const cells = row.getElementsByTagName('td'); // Get all cells in the row
            const requestIdCell = cells[1]; // Assuming the Request ID is the second column (index 1)
            const requestId = requestIdCell.textContent; // Get the text content of the Request ID cell
            console.log("Request ID:", requestId); // Log the requestId
            
            selectedRequestIdPass = requestId // Trim whitespace

            console.log('Selected Request ID:', selectedRequestIdPass); // Debugging log

            showTaskDetails(requestId);
        }
    });   
}

// Event listeners for filter buttons in ongoing tasks
document.getElementById('filterHighPriority').addEventListener('click', () => {
    fetchOngoingTasks(userFullName, { priorityLevel: 'high' });
});

document.getElementById('filterMicrobialTesting').addEventListener('click', () => {
    fetchOngoingTasks(userFullName, { requestType: 'microbialTesting' });
});

document.getElementById('filterMicrobialAnalysis').addEventListener('click', () => {
    fetchOngoingTasks(userFullName, { requestType: 'microbialAnalysis' });
});

document.getElementById('filterLabResearchProcesses').addEventListener('click', () => {
    fetchOngoingTasks(userFullName, { requestType: 'labResearchProcesses' });
});

document.getElementById('filterHighPriorityProcessed').addEventListener('click', () => {
    fetchProcessedTasks(userFullName, { priorityLevel: 'high' });
});

document.getElementById('filterMicrobialTestingProcessed').addEventListener('click', () => {
    fetchProcessedTasks(userFullName, { requestType: 'microbialTesting' });
});

document.getElementById('filterMicrobialAnalysisProcessed').addEventListener('click', () => {
    fetchProcessedTasks(userFullName, { requestType: 'microbialAnalysis' });
});

document.getElementById('filterLabResearchProcessesProcessed').addEventListener('click', () => {
    fetchProcessedTasks(userFullName, { requestType: 'labResearchProcesses' });
});

document.getElementById('filterHighPriorityRejected').addEventListener('click', () => {
    fetchRejectedTasks(userFullName, { priorityLevel: 'high' });
});

document.getElementById('filterMicrobialTestingRejected').addEventListener('click', () => {
    fetchRejectedTasks(userFullName, { requestType: 'microbialTesting' });
});

document.getElementById('filterMicrobialAnalysisRejected').addEventListener('click', () => {
    fetchRejectedTasks(userFullName, { requestType: 'microbialAnalysis' });
});

document.getElementById('filterLabResearchProcessesRejected').addEventListener('click', () => {
    fetchRejectedTasks(userFullName, { requestType: 'labResearchProcesses' });
});

let selectedAppointmentDocId = null;

// Function to handle row highlighting and adding to ongoing tasks
document.getElementById('taskTableBody').addEventListener('click', (event) => {
    const targetRow = event.target.closest('tr');
    if (targetRow && targetRow.parentNode === document.getElementById('taskTableBody')) {
        // Remove highlight from any previously highlighted row
        const highlightedRow = document.querySelector('.highlighted');
        if (highlightedRow) {
            highlightedRow.classList.remove('highlighted');
        }

        // Highlight the selected row
        targetRow.classList.add('highlighted');

        // Show the "Add to Ongoing" button
        document.getElementById('addToOngoingButton').classList.remove('hidden');

        selectedAppointmentDocId = targetRow.cells[1].innerText;
    }
});


// Add event listener for the "Add to Ongoing" button
document.getElementById('addToOngoingButton').addEventListener('click', async () => {
    if (selectedAppointmentDocId) {
        try {
            // Step 1: Query 'appointments' collection for a document where requestId == selectedAppointmentDocId
            const appointmentsQuery = query(
                collection(firestore, 'appointments'), 
                where('requestId', '==', selectedAppointmentDocId)
            );
            const appointmentsSnapshot = await getDocs(appointmentsQuery);

            if (!appointmentsSnapshot.empty) {
                // Step 2: Get the first matching appointment document
                const appointmentDoc = appointmentsSnapshot.docs[0];
                const appointmentData = appointmentDoc.data();
                const actualRequestId = appointmentData.requestId; // Extract the requestId

                // Step 3: Query 'requests' collection for the corresponding request document using the actualRequestId
                const requestsQuery = query(collection(firestore, 'requests'), where('requestId', '==', actualRequestId));
                const requestSnapshot = await getDocs(requestsQuery);

                if (!requestSnapshot.empty) {
                    // Assuming the first match (requestId should be unique)
                    const requestDoc = requestSnapshot.docs[0];
                    const requestData = requestDoc.data();
                    let newStatus;

                    // Determine the new status based on the current status
                    if (requestData.request_status === 'analysing') {
                        newStatus = 'verifying'; // Change to 'analyzing' if current status is 'validating'
                    } else if (requestData.request_status === 'preparing') {
                        newStatus = 'inspecting'; // Change to 'preparing' if current status is 'scheduling'
                    } else {
                        alert('Invalid current status for this operation.');
                        return;
                    }

                    // Step 4: Update the request status in Firestore
                    await updateDoc(doc(firestore, 'requests', requestDoc.id), {
                        request_status: newStatus // Update the status accordingly
                    });

                    // Provide feedback
                    alert(`Task status has been updated to '${newStatus}'.`);

                    document.getElementById('addToOngoingButton').classList.add('hidden');

                    // Optionally, refresh the task list
                    await fetchAssignedTasks(userFullName); // Refresh the assigned tasks to reflect changes
                    await fetchOngoingTasks(userFullName); // Refresh ongoing tasks to reflect changes
                } else {
                    alert('Request not found in requests collection.');
                }
            } else {
                alert('Appointment not found.');
            }
        } catch (error) {
            console.error('Error updating task:', error);
            alert('An error occurred while updating the task.');
        }
    } else {
        alert('Please select a task to add to ongoing.');
    }
});

// Styling for highlighted rows
const style = document.createElement('style');
style.innerHTML = `
    .highlighted {
        background-color: #ffcccb;
    }
`;
document.head.appendChild(style);

// Initialize the task lists on page load
onAuthStateChanged(getAuth(), async (user) => {
    if (user) {
        userFullName = await getUserFullName(user.uid); // Assign userFullName to the higher scoped variable
        await fetchAssignedTasks(userFullName); // Fetch assigned tasks (initial fetch)
        await fetchOngoingTasks(userFullName, { priorityLevel: 'high' });
    }
});
