import '../css/normalize.css'
import '../css/main.css'

import * as icsUtils from './icsUtils.js'
import * as helpers from './helpers.js'

import Cookies from 'js-cookie'
import List from 'list.js'
import {Calendar} from '@fullcalendar/core'
import timeGridPlugin from '@fullcalendar/timegrid'

import {term, termSubtitle, scheduleJSON, startSemester, endSemester, 
        endHalfSemester, endSemesterISO, endHalfSemesterISO} from './constants'

import packageInfo from '../package.json';

let selectedClasses = []

let plan

let classSchedObj

// Needs to be global so can i.e. search from the window location hash
let hackerList
let fullCalendar

let clickCount = 0
let plansCount = 0

let curCookies = []

const normalEventColor = '#31425F'
const highlightEventColor = '#F46523'

function initList(tableArr) {
  // Initialize hacker news
  const hackerListOptions = {
    valueNames: ['ref', 'subj', 'numSec', 'c_title', 'cred', 'dist', 'lim', 'enrld', 'instruct', 'days', 'time', 'rm', {
      name: 'idCopy',
      attr: 'for'
    }, {
      name: 'id',
      attr: 'id'
    }, {
      name: 'URL',
      attr: 'href'
    },
    'comment', 'labelSummary'],
    // W/o labels on all, just on rref number
    item: '<tr class="trClickable"> <td><label><input class="id" type="checkbox"><div class="visuallyhidden labelSummary"></div></div></label></td> <td> <div class="ref"> </div><a target="_blank" class="URL icon-link"></a> </td> <td> <div class="subj"> </div> </td> <td> <div class="numSec"> </div> </td> <td> <p class="c_title"></p> <div class="comment"></div> </td> <td> <div class="cred"> </div> </td> <td> <div class="dist"> </div> </td> <td> <div class="enrld"></div>/<div class="lim"> </div> </td> <td> <div class="instruct"> </div> </td> <td> <div class="days"> </div> </td> <td> <div class="time"> </div> </td> <td> <div class="rm"> </div> </td> </tr>',
    indexAsync: true,
    searchDelay: 500
    // Can't do pagination because doesn't allow to modify the elements (check the checkbox)
  }
  hackerList = new List('hacker-list', hackerListOptions, tableArr)
  hackerList.on('searchComplete', function () {
    if (hackerList.visibleItems.length === 0) {
      document.getElementById('classTable').classList.add('hideClass')
      document.getElementById('search').classList.add('searchMargin')
    } else {
      document.getElementById('classTable').classList.remove('hideClass')
      document.getElementById('search').classList.remove('searchMargin')
    }
  })
  hackerList.items.forEach(item => item.elm.onclick = rowClickHandler)

  let searchLock = false
  hackerList.on('searchComplete', (filterDist) => {
  {
    if (! searchLock) {
      searchLock = true
      let search_string = document.getElementById('search').value
      
      console.log('search is done')

      let search_prefixes = ["dist", "subj", "title", "instruct", "cred", "days", "time"]
      let filter_dict = {
        "dist": false,
        "subj": false,
        "title": false,
        "instruct": false,
        "cred": false,
        "days": false,
        "time": false
      };
      
      for (let prefix of search_prefixes) {
        let found_prefix = helpers.extractToken(search_string, prefix + ":")
        //console.log(dist_search)
        if (found_prefix)
        {
          console.log('found prefix:' + prefix)
          filter_dict[prefix] = found_prefix
          search_string = helpers.removeToken(search_string, found_prefix, prefix + ":")
          //console.log("new search is: " + newSearch)
          //hackerList.search(search_string)
        }
      }
      hackerList.filter(function(item) {
        for (let prefix of search_prefixes) {
          if (filter_dict[prefix])
          {
            let item_name = prefix
            if (item_name.includes("title")) {item_name = "c_title"}
            if (! item.values()[item_name])
            {
              return false
            }
            //console.log("item name = " + item.values()[item_name])
            //console.log("search found = " + filter_dict[prefix])
            if (! item.values()[item_name].toUpperCase().includes(filter_dict[prefix].toUpperCase()))
            {
              return false
            } 
          }
        }
        return true
      });
      
      console.log("new search is: " + search_string)
      hackerList.search(search_string)
    }
    else 
    {
      searchLock = false
    }
   }
  });
}

let maximumStartTime = '09:00:00'
let minimumEndTime = '16:00:00'

function shortenRoom(room) {
  return room.replaceAll('Science Center', 'Sci')
             .replaceAll(' Hall', '')
             .replaceAll('CUNNIFF', '199')
             .replaceAll('CHANGHOU', '101');
}

function initCalendar() {
  document.getElementById('calContainer').classList.add('active')
  // page is now ready, initialize the calendar...
  const calendarElement = document.getElementById('calendar')
  fullCalendar = new Calendar(calendarElement, {
    height: 'auto',
    plugins: [timeGridPlugin],
    slotMinTime: maximumStartTime,
    slotMaxTime: minimumEndTime,
    weekends: false,
    allDaySlot: false,
    headerToolbar: false,
    dayHeaderFormat: {weekday: 'long'},
    initialView: 'timeGridWeek',
    editable: false,
    eventClick: function(arg) {
        const props = arg.event.extendedProps
        const time = props.time.split('<br>')[0].replaceAll('am', '').replaceAll('pm', '').replace('-', '- ')
        var modal = document.getElementById("eventModal");
        var modalText = document.getElementById("modal-text");
        modalText.innerHTML = '<p class="modal-title"><b>' + props.subj + ' ' + props.numSec + '</b>: ' + props.c_title + '</b>' +
            '<br>' + time + '| ' + props.rm + '<br></p><hr style="width:25%;margin:auto"><br><p class="smallFont">' +
            props.days.replace('M',' Monday').replace('T',' Tuesday').replace('W',' Wednesday').replace('TuesdayH',' Thursday')
            .replace('TH',' Thursday').replace('F',' Friday') + '<br>Instructor: ' + props.instruct + '<br>Distribution: ' +
            props.dist + '<br>Enrollment: ' + props.enrld + '/' + props.lim + '<br>Credits: ' + props.cred + '<br><br></p>';
        modal.style.display = "block";
    },
    eventColor: normalEventColor,
    eventContent: function(arg) {
      const props = arg.event.extendedProps
      // need the split since multitime objects have both times in props.time, making everything ugly
      const time = props.time.split('<br>')[0].replaceAll('am', '').replaceAll('pm', '').replace('-', '- ')
      const room = shortenRoom(props.rm)
      return {html: '<div class="fc-event-main-frame"><div class="fc-event-time">' + time + '| ' + room +
        '</div><div class="fc-event-title-container"><div class="fc-event-title fc-sticky"><b>' + props.subj +
        ' ' + props.numSec + '</b>: ' + props.c_title + "</div></div></div>"}
    }
  })
  fullCalendar.render()
}

function updateSlotTimes() {
  const events = fullCalendar.getEvents()
  let minTime = maximumStartTime
  let maxTime = minimumEndTime
  for (const i in events) {
    // Can use string comparison to compare because is 24 hour time
    const evnt = events[i]
    const start = evnt.start.toTimeString().split(' ')[0]
    const end = evnt.end.toTimeString().split(' ')[0]
    if (start < minTime) {
      minTime = start
    }
    if (end > maxTime) {
      maxTime = end
    }
  }
  fullCalendar.setOption('slotMinTime', minTime)
  fullCalendar.setOption('slotMaxTime', maxTime)
}

function selectClass(id, bulk) {

  // If bulk, don't save to cookie/hash so don't hammer in initial load
  // this will contain a reference to the checkbox

  // Selected a new class
  if (selectedClasses.indexOf(id) === -1) {

    const thisClass = classSchedObj[0][id]
    // in classSchedObj[0] so not in classSchedObj[1] so has a time
    if (thisClass != null) {
      let source = {id: id, events: [createEventFromClass(thisClass)]}
      if (thisClass.multiTime != null) {
        source.events.push(createEventFromClass(thisClass.multiTime))
      }
      fullCalendar.addEventSource(source)
      updateSlotTimes()
    }
  
    selectedClasses.push(id)
    
  } else {
    // selected an old class (if multitime, will delete both TODO)
    const thisClass = classSchedObj[0][id]
    // in classSchedObj[0] so not in classSchedObj[1] so has a time
    if (thisClass != null) {
      fullCalendar.getEventSourceById(id).remove()
      thisClass.highlighted = false
      updateSlotTimes()
    }

    selectedClasses.splice(selectedClasses.indexOf(id), 1)

    // If deleting in bulk, then can do one for loop
    // Technically, this doesn't work if you are doing a bulk select which
    // invovles *both* addition and removal of classes but, we only use bulk
    // when initally adding all classes (all adds) or removing all classes
    // (all removes) so should be safe

    if (!bulk) {
      for (const item in hackerList.items) {
        if (parseInt(hackerList.items[item].values().id) === id) {
          hackerList.items[item].elm.children[0].children[0].children[0].checked = false
          hackerList.items[item].elm.classList.remove('trHigh')
        }
      }
    }
  }

  if (!bulk) {
    reloadRightCol()
    updateHashCookie()
  }
}


function rowClickHandler(event) {
  const classID = parseInt(event.currentTarget.getElementsByClassName('id')[0].id)
  event.currentTarget.querySelector('input').checked = true
  event.currentTarget.classList.add('trHigh')

  selectClass(classID, false)
}

function loadInitURL() {
  const hashArray = window.location.hash.replace('#', '').replace(/.*__/, '').split(',')
  const hashClasses = []
  const highlighedClasses = []
  for (let i = 0; i < hashArray.length; i++) {
    if (hashArray[i] === '') {
      continue
    }
    if (hashArray[i].slice(-1) === '_') {
      const classId = hashArray[i].replace('_', '')
      hashClasses.push(classId)
      highlighedClasses.push(classId)
    } else {
      hashClasses.push(hashArray[i])
    }
  }

  // Check all the boxes for these items w/in the hacker list (and, while
  // we're there, `select' these classes)
  for (const item in hackerList.items) {
    if (hashClasses.indexOf(hackerList.items[item].values().id) !== -1) {
      // Check the checkbox for this list item, doesn't call the callback
      // because, for now, nothing is shown (just startup)
      hackerList.items[item].elm.children[0].children[0].children[0].checked = true
      hackerList.items[item].elm.classList.add('trHigh')
      hackerList.items[item].elm.children[0].children[0].children[0].checked = true
      selectClass(parseInt(hackerList.items[item].values().id), true)
    }
  }
  for (let i = 0; i < highlighedClasses.length; i++) {
    highlightClass(highlighedClasses[i], true)
  }
  reloadRightCol()
  updateHashCookie()
}

function setHash(hash) {
  if ('replaceState' in history) {
    history.replaceState('', '', hash)
  } else {
    window.location.hash = hash
  }
}

function updateHashCookie() {
  const hashStrArr = []
  for (let i = 0; i < selectedClasses.length; i++) {
    let classStr = selectedClasses[i]
    // If has mult
    if ((selectedClasses[i] in classSchedObj[0] && classSchedObj[0][selectedClasses[i]].highlighted === true) ||
           (selectedClasses[i] in classSchedObj[1] && classSchedObj[1][selectedClasses[i]].highlighted === true)) {
      classStr += '_'
    }
    hashStrArr.push(classStr)
  }
  // So when adds in, keeps most of the order
  hashStrArr.sort()
  const hashStr = term + '__' + hashStrArr.join(',')
  if (hashStrArr.length > 0) {
    setHash('#' + hashStr)
    Cookies.set(plan, hashStr, { expires: 365 })
  } else {
    // . clears
    setHash('#')
  }
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').then(registration => {
        console.log('SW registered: ', registration);
      }).catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
    });
  }
}

function loadPlanFromCookies() {

  for (let cookieName in Cookies.get()) {
    if (cookieName != "undefined" && cookieName != "parent-option-2"
                                        && Cookies.get(cookieName).includes(term)){

      // Creates and styles the dropdown menu
      let parent = document.querySelector('.slide')

      let child = document.createElement('li')
      let grandchild = document.createElement('a')
      let text = document.createTextNode(cookieName)

      grandchild.setAttribute('href', '#')
      grandchild.setAttribute('id', cookieName)
      grandchild.appendChild(text)

      child.setAttribute('id', cookieName)
      child.appendChild(grandchild)
      parent.appendChild(child)

      curCookies.push(cookieName)

      plansCount = plansCount + 1
    } 
  }

  resizeDropdown()
}

function resizeDropdown() {
  let parent = document.querySelector('.slide')

  if (plansCount == 1) {
    parent.style.height = '51px'
    parent.style.maxHeight = '51px'
  } else if (plansCount == 2) {
    parent.style.height = '101px'
    parent.style.maxHeight = '101px'
  } else if (plansCount >= 3){
    parent.style.height = '151px'
    parent.style.maxHeight = '151px'
  } else {
    parent.style.height = '0px'
    parent.style.maxHeight = '0px'
  }
}

function createPlan(plan) {
  // Sets cookie for new plan with plan name as key, list of classIDs => '' as values
  if (plan != 'parent-option-2' && plan){
    Cookies.set(plan, term + '__', { expires: 365 })
  }
}

function changePlan(plan) {
  document.getElementById('plan-name').value = plan
  document.getElementById('ss-span').textContent = plan

  // New Plan:
  // Pull classes from formatted cookies if they exist, else make new arr to store them
  let arrScFromCookies = []
  let planCookies = Cookies.get(plan)

  if (planCookies && planCookies !== term + "__") {
    arrScFromCookies = Cookies.get(plan).replace(term + "__", "").split(",")   
  } else {
    arrScFromCookies = [] 
  }

  clearAll()

  selectedClasses = arrScFromCookies

  console.log("Loading cookies from picked plan: " + plan)
  console.log(selectedClasses.length + " class IDs were found.")

  // Converts class ID arr to str to pass in setHash(hash)
  if (selectedClasses.length > 0) {
    let strCookiesForCurrentPlan = selectedClasses.join(',')
    let valCookiesForCurrentPlan = term + "__" + strCookiesForCurrentPlan
    let hashClasses = []

    for (let i = 0; i < selectedClasses.length; i++) {
      hashClasses.push(selectedClasses[i])
    }

    for (const item in hackerList.items) {
      if (hashClasses.indexOf(hackerList.items[item].values().id) !== -1) {
        // Check the checkbox for this list item, doesn't call the callback
        // because, for now, nothing is shown (just startup)
        hackerList.items[item].elm.children[0].children[0].children[0].checked = true
        hackerList.items[item].elm.classList.add('trHigh')
        hackerList.items[item].elm.children[0].children[0].children[0].checked = true
        selectClass(parseInt(hackerList.items[item].values().id), true)
      }
    }
    setHash('#' + valCookiesForCurrentPlan)
    Cookies.set(plan, valCookiesForCurrentPlan, { expires: 365 })
  }
  reloadRightCol()
}

function removeCookie(cookieName) {
  if (Cookies.get(cookieName)) {
    cookieName = cookieName.replaceAll(' ', '%20')
    document.cookie = cookieName +'=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    console.log(`Cookie "${cookieName}" removed successfully`)
  } else {
    console.log(`Cookie "${cookieName}" not found`)
  }
}

function deletePlan() {
  let cookie = Cookies.get(plan)

  // Must go first or cookie will be reassigned
  if (cookie) {
    if (cookie.split(',') > 0){
      window.alert('in if')
      clearAll()
    }
    removeCookie(plan)

    let child = document.getElementById(plan)
    child.remove()
    curCookies.splice(curCookies.indexOf(plan), 1)
    plansCount--

    document.getElementById('plan-name').value = ""
    resizeDropdown()
  }

  if (plansCount == 0) {
    let dropdownContent = document.getElementById('ss-span')
    dropdownContent.textContent = "Saved Plans"
    dropdownContent.classList.remove("drop-down")
    dropdownContent.classList.add("drop-up")
  }

}

function savePlan() {
  // Get user input plan name
  plan = document.getElementById('plan-name').value
  let parent = document.querySelector('.slide')
  clearAll()

  // Avoids duplicate plans with same name
  if (Cookies.get(plan)) {
    console.log(plan + " already exists. Loading plan.")
    changePlan(plan)

  } else if (plan != ""){
    console.log(plan + " doesn't exist. Creating plan.")
    createPlan(plan)

    // Creates and styles the dropdown menu
    let child = document.createElement('li')
    let grandchild = document.createElement('a')
    let text = document.createTextNode(plan)

    grandchild.setAttribute('href', '#')
    grandchild.setAttribute('id', plan)
    grandchild.appendChild(text)

    child.setAttribute('id', plan)
    child.appendChild(grandchild)
    parent.appendChild(child)
  } 

  plansCount = plansCount + 1

  resizeDropdown()
}

function setupEventListeners() {
    document.getElementById('toggleCal').addEventListener('click', toggleCal)
    document.getElementById('export-btn').addEventListener('click', exportBtn)
    document.getElementById('save-button').addEventListener('click', savePlan)
    document.getElementById('cc-button').addEventListener('click', deletePlan)
    
    // Listens to plan dropdown changes and changes plans accordingly
    let parentId = document.querySelector('.slide')
    parentId.addEventListener('click', function(event){
        console.log("HELLOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO")
      if (event) {
        event.preventDefault()
        plan = event.target.getAttribute('id')
        changePlan(plan)
      }
    });

    let dropdownContent = document.getElementById('ss-span')
    dropdownContent.classList.add("drop-up")
    dropdownContent.addEventListener('click', function(){
      if (plansCount){
        if (clickCount % 2 || clickCount == 1) {
          dropdownContent.classList.add("drop-up")
          dropdownContent.classList.remove("drop-down")
        } else {
          dropdownContent.classList.remove("drop-up")
          dropdownContent.classList.add("drop-down")
        }
      }
      clickCount++
    })
  
    // yea this isn't exactly proper for this func but whatever
    // this hook is nice and it serves its purpose well
    var modal = document.getElementById("modalContent");
    var modalRoot = document.getElementById("eventModal");
    modalRoot.onclick = function() {
        modalRoot.style.display = "none";
    }
    modal.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    }
}

// would like this script to be in the html directly but the onload is tricky
// due to module, the functions aren't global and can't be called from the html directly

function createEventFromClass(classObj) {
    let newEvent = {...classObj}
    newEvent.daysOfWeek = classObj.dow
    newEvent.startTime = classObj.start
    newEvent.endTime = classObj.end
    return newEvent
}

function highlightClass(id, bulk) {
  // if bulk, don't change cookie/hash (from beginning)
  let thisClass = classSchedObj[0][id]
  if (thisClass != null) {
    // we'd love to use event.setProp but it doesn't seem to rerender so we remove event and add it back w/ right colors
    fullCalendar.getEventSourceById(id).remove()
    let source = {id: id, events: [createEventFromClass(thisClass)]}
    if (thisClass.multiTime != null) {
      source.events.push(createEventFromClass(thisClass.multiTime))
    }
    if (!thisClass.highlighted) {
      source.backgroundColor = highlightEventColor
      source.borderColor = highlightEventColor
      source.textColor = '#222'
    } else {
      source.backgroundColor = normalEventColor
    }

    fullCalendar.addEventSource(source)
  } else {
    // Has no time
    thisClass = classSchedObj[1][id]
  }
  if (thisClass != null) {
    thisClass.highlighted = !thisClass.highlighted
  }
  
  if (!bulk) {
    updateHashCookie()
    reloadRightCol()
  }
}

function highlightCallback(event) {
  const clickedElemVal = parseInt(event.currentTarget.value)
  highlightClass(clickedElemVal, false)
}

function trashCallback(event) {
  const clickedElemVal = parseInt(event.currentTarget.value)
  selectClass(clickedElemVal, false)
}

function reloadRightCol() {
  let htmlObj = []
  let html = ''
  selectedClasses = [...new Set(selectedClasses.map(item => parseInt(item)))];
  for (let i = 0; i < selectedClasses.length; i++) {
    let noTime = ''
    let boldClass = ''
    let highlightClass = ''
    let thisClass = classSchedObj[0][selectedClasses[i]]

    // No time
    if (thisClass == null) {
      thisClass = classSchedObj[1][selectedClasses[i]]
      noTime = ' - <i>No&nbsp;Set&nbsp;Time</i>'
    }
    if (thisClass == null) {
      // Abort! - neither no time or one time
      continue
    }

    if (thisClass.highlighted) {
      boldClass = 'bold'
      highlightClass = 'highlight'
    }

    htmlObj.push({
      key: thisClass.subj + thisClass.numSec,
      val: "<div class='chosenClass'><button class='icon_button icon-trash-1' aria-label='remove class' value='" + thisClass.id + "'></button><button aria-label='highlight class' class='icon_button icon-brush " + highlightClass + "' value='" + thisClass.id + "'></button><span><span class='" + boldClass + " chosenClassLeft'>" + thisClass.subj + ' ' + thisClass.numSec + ": </span><span class='chosenClassRight'>" + thisClass.c_title + noTime + '&nbsp;(' + thisClass.id + ')</span></span></div>'
    })
    
  }
  htmlObj = htmlObj.sort(function (a, b) {
    return a.key.localeCompare(b.key)
  })
  for (const z in htmlObj) {
    // For button, don't need label
    // html += "<label>" + htmlObj[z].val + "</label>";
    html += htmlObj[z].val
  }
  if (html === '') {
    document.getElementById('clearAll_par').innerHTML = ''
    // Also change in HTML so loads immediately
    document.getElementById('rightCol').innerHTML = 'No courses selected'
  } else {
    document.getElementById('clearAll_par').innerHTML = '<div id="clearClasses"><b>CLEAR<b></div>'
    document.getElementById('clearClasses').onclick = clearAll
    document.getElementById('rightCol').innerHTML = html
  }

  if (htmlObj.length !== 0) {
    document.getElementById('rightCol').classList.add('multiCol')
  } else {
    document.getElementById('rightCol').classList.remove('multiCol')
  }
  document.querySelectorAll('.icon-brush').forEach(el => el.onclick = highlightCallback)
  document.querySelectorAll('.icon-trash-1').forEach(el => el.onclick = trashCallback)
}

/*
 * This func is a little odd. We use transitions (see main.css #calContainer)
 * on height change for the "toggle" effect. Unfortunately, transitions don't fire if
 * either the from or to height is "auto". If the container height is not auto, when active,
 * we can't expand how much of the calendar the user sees in response to adding say an 8:30pm
 * class. Thus, this workaround of setting height to auto after the transition to active and 
 * setting to a specific height before the transition to non-active.
 *
 * It's unclear why we have to use setTimeout to set the container height to what we want.
 * As of 2021-05, it is necessary so that we see transitions (Firefox, Chrome).
 */
function toggleCal() {
  const container = document.getElementById('calContainer')
  if (container.classList.contains('active')) {
    container.style.height = container.clientHeight + 'px'
    container.addEventListener('transitionend', () => container.classList.remove('active'), {once: true})
    setTimeout(() => container.style.height = '0px', 0)
  } else {
    container.classList.add('active')
    container.style.height = 'auto'
    let height = container.clientHeight + 'px'
    container.style.height = '0px'
    container.addEventListener('transitionend', () => container.style.height = 'auto', {once: true})
    setTimeout(() => container.style.height = height, 0)
  }
  fullCalendar.render()
}

// Click handler for ics export button
function exportBtn() {
  for (let i = 0; i < selectedClasses.length; i++) {
    // Grab class
    let thisClass = classSchedObj[0][selectedClasses[i]]

    // Defined check for id and time
    try {
      console.log("Grabbed class " + thisClass.id + " at time " + thisClass.time)
    } catch {
      console.log("Why would you ever put a class on scheduler that doesn't have a time :(")
      continue
    }

    // Null class--don't fatal error just skip and log
    if (thisClass == null) {
      console.log("Failed to get class info--thisClass is null")
      continue
    }

    // Init string-based time arrays
    let startTime = ["", ""]
    let endTime = ["", ""]

    // Time is really stupid--there's probably a lib to parse this stuff easier but eh
    // If morning or noon, grab digits as is
    if(String(thisClass.time).substring(11,13) === 'am'
      || (String(thisClass.time).substring(11,13) === 'pm'
      && String(thisClass.time).substring(0,2) === '12')) {
        startTime[0] = String(thisClass.time).substring(0,2)
    }

    // If midnight, set to 00 for military time (shouldn't happen but eh)
    else if(String(thisClass.time).substring(11,13) === 'am'
            && String(thisClass.time).substring(0,2) === '12') {
      startTime[0] = '00'
    }

    // Else, must be afternoon or evening, so add 12 for military time
    else {
      startTime[0] = (parseInt(String(thisClass.time).substring(0,2)) + 12).toString()
    }

    // Set minutes normally
    startTime[1] = String(thisClass.time).substring(3, 5)

    // Same deal for end time
    // If morning or noon, grab digits as is
    if(String(thisClass.time).substring(30,32) === 'am'
      || (String(thisClass.time).substring(30,32) === 'pm'
      && String(thisClass.time).substring(19,21) === '12')) {
        endTime[0] = String(thisClass.time).substring(19,21)
    }

    // If midnight, set to 00 for military time (shouldn't happen but eh)
    else if(String(thisClass.time).substring(30,32) === 'am'
            && String(thisClass.time).substring(19,21) === '12') {
      endTime[0] = '00'
    }

    // Else, must be afternoon or evening, so add 12 for military time
    else {
      endTime[0] = (parseInt(String(thisClass.time).substring(19,21)) + 12).toString()
    }

    // Set minutes normally
    endTime[1] = String(thisClass.time).substring(22,24)

    // ics builder params
    let bigTitle = thisClass.subj + thisClass.numSec + ": " + thisClass.c_title
    let start = [startSemester[0], startSemester[1], startSemester[2], startTime[0], startTime[1]];
    let end = [startSemester[0], startSemester[1], startSemester[2], endTime[0], endTime[1]]

    // RRule day format, see icsUtils for info--get from M,T,W,TH,F to MO,`TU`,WE,TH,FR
    console.log(thisClass.days)
    let days = '';
    if (String(thisClass.days) == "T") {
      days = 'TU';
    }
    else {
      days = String(thisClass.days.replace('M','MO')
                                      .replace('T,','TU,')
                                      .replace('W','WE')
                                      .replace('F','FR'))
    }

    // Fix start for various days of the week
    icsUtils.fixDates(days, start, end, startSemester)
    
    // Default class end
    let classEnd = endSemesterISO;

    // PhysEd half semester class handler
    // TODO: implement for other half sem classes
    if (thisClass.subj == 'PHED') {
      // Change start to half for II classes
      if(String(thisClass.c_title).includes('II'))
      {
        start = [endHalfSemester[0], endHalfSemester[1], endHalfSemester[2], startTime[0], startTime[1]]
        end = [endHalfSemester[0], endHalfSemester[1], endHalfSemester[2], endTime[0], endTime[1]]

        // Fix start for various days of the week
        icsUtils.fixDates(days, start, end, endHalfSemester)
      }
      // Change end to half for I classes
      else if(String(thisClass.c_title).includes('I'))
      {
        classEnd = endHalfSemesterISO
      }
    }  
    
    let room = shortenRoom(thisClass.rm)

    console.log("Calling icsUtils.buildEvent(%s, %s, %s, %s, %s, %s)", bigTitle, start.toString(), end.toString(), days, classEnd.toString(), room)
    icsUtils.buildEvent(bigTitle, start, end, days, classEnd, room)

    console.log("\n")
  }
  console.log("Building ics file...")
  icsUtils.buildFile()
}

function clearAll() {
  console.log('Clearing all')
  // Check all the boxes for these items w/in the hacker list (and, while
  // we're there, `select' these classes)

  // The id value of the hackerList is a string so to make .indexOf work,
  // convert selectedClasses to a string
  const strSelectedClasses = []
  for (const i in selectedClasses) {
    strSelectedClasses.push(selectedClasses[i].toString())
  }
  for (const item in hackerList.items) {
    if (strSelectedClasses.indexOf(hackerList.items[item].values().id) !== -1) {
      // Check the checkbox for this list item, doesn't call the callback
      // because, for now, nothing is shown (just startup)
      console.log('Clearing an elem')
      hackerList.items[item].elm.children[0].children[0].children[0].checked = false
      hackerList.items[item].elm.classList.remove('trHigh')
      // TODO don't update hash values for these bc wasteful
      // TODO don't update rightcol, do it afterward
      selectClass(parseInt(hackerList.items[item].values().id), true)
    }
  }
  selectedClasses = []
  reloadRightCol()
  updateHashCookie()
  
}

registerSW()
initCalendar()
setupEventListeners()

document.getElementById('semester-subtitle').textContent = termSubtitle
document.getElementById('version').textContent = 'v' + packageInfo.version

let request = new XMLHttpRequest()
request.open('GET', scheduleJSON, true)
request.onload = function() {
  if (this.status >= 200 && this.status < 400) {
    // classSchedObj from included schedule.js file (made with `doAll` in folder)
    // classSchedObj = [hasTimes, hasNoTimes, multipleTimes]
    classSchedObj = JSON.parse(this.response)
    const tableArr = []

    // Do normal hasTimes and hasNoTimes. multipleTimes is checked when added to see if exists
    for (let i = 0; i <= 1; i++) {
      for (const z in classSchedObj[i]) {
        const id = classSchedObj[i][z].id
        // TODO what should the ADA label be?
        classSchedObj[i][z].labelSummary = classSchedObj[i][z].ref + ' ' + classSchedObj[i][z].subj + classSchedObj[i][z].numSec
        // In multipleTimes so add below the main item

        classSchedObj[i][z].multipleTimes = null
        classSchedObj[i][z].highlighted = false
        classSchedObj[i][z].title = classSchedObj[i][z].subj + ' ' + classSchedObj[i][z].numSec + ': ' + classSchedObj[i][z].c_title

        if (id in classSchedObj[2]) {
          classSchedObj[i][z].days += '<br>' + classSchedObj[2][id].days
          classSchedObj[i][z].time += '<br>' + classSchedObj[2][id].time

          classSchedObj[i][z].multiTime = classSchedObj[2][id]
          // Needed for calendar to know how to delete
          classSchedObj[i][z].multiTime.id += 'extra'
          classSchedObj[i][z].multiTime.title = classSchedObj[i][z].title
        }
        tableArr.push(classSchedObj[i][z])
      }
    }

    initList(tableArr)

    var scheduleLink = window.location.hash

    console.log(scheduleLink)

    // Handles cookie "undefined"
    clearAll()
    removeCookie("undefined")
    setHash(scheduleLink)

    // Does cookie exist?
    let exists = false
    let cookiesObj = Cookies.get()
    for (var i = 0; i < Object.keys(cookiesObj).length; i++){
        let cur = Object.values(cookiesObj)[i]
        if (!cur.includes(term))
            continue

        console.log(cur)
        // look for the entry with a matching `code` value
        if (cur == scheduleLink.replace("#","")){
            exists = true
            console.log("exists")
            plan = Object.keys(cookiesObj)[i]
            console.log(plan)
        }
    }

    // Prioritize URL over cookie
    if (scheduleLink !== '') {
        // Make sure is new style URL and is for this term
        // TODO be able to look at previous semesters?
        // If old style or for old term, clear hash

        if(!exists) {
            plan = "Imported from URL"
            loadInitURL()
        }
        loadPlanFromCookies()
        changePlan(plan)
    } else {
        loadPlanFromCookies()
        if(plansCount > 0) {
            plan = curCookies[0]
            changePlan(plan)
        }
    }
  }
}

request.send()
