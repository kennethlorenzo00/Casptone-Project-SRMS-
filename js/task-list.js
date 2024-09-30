import { firestore, database } from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";
import { collection, getDocs, query, where, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
                            <button class="btn-samplereport">Report</button>
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
                        <button class="btn-equipreport">Report</button>
                    </td>
                </tr>
            `;
            sampleTableBody.innerHTML += row;
        }

        // Attach event listeners to the report and count colonies buttons
        document.querySelectorAll('.btn-samplereport').forEach(button => {
            button.addEventListener('click', () => {
                alert('Sample Report action clicked');
            });
        });

        document.querySelectorAll('.btn-equipreport').forEach(button => {
            button.addEventListener('click', () => {
                alert('Equipment Report action clicked');
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

        if (!['releasing'].includes(requestData.request_status)) {
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

        // Store the selected appointment document ID for later use
        selectedAppointmentDocId = targetRow.cells[1].innerText; // Assuming the Appointment Doc ID is in the second cell
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
